package com.axonkey.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import android.os.SystemClock
import androidx.core.content.ContextCompat
import okio.ByteString.Companion.toByteString
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * Sample-Exact AKA1 Voice Capture & Live RMS Waveform Controller.
 *
 * - Captures 10ms frames (160 samples = 320 bytes @ 16kHz mono signed PCM16LE).
 * - Normal stop (stopVoiceStream): finishes final AudioRecord read, sends final AKA1 binary frame,
 *   and THEN stamps seq and sends voice.end(finalSampleExclusive) under OutboundArbiter.sendLock.
 * - Abnormal abort (cancelVoiceStream / onPause / disconnect / auth clear): immediately aborts
 *   capture and sends voice.cancel without waiting for audio drain.
 */
class VoiceCaptureController(
    private val context: Context,
    private val arbiter: OutboundArbiter,
    private val onRequestRecordPermission: () -> Unit,
    private val onVoiceLevel: (Double) -> Unit
) {
    companion object {
        private const val SAMPLE_RATE_HZ = 16_000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_ENCODING = AudioFormat.ENCODING_PCM_16BIT

        // 10ms @ 16kHz mono s16le = 160 samples = 320 bytes
        private const val FRAME_SAMPLES = 160
        private const val FRAME_BYTES = FRAME_SAMPLES * 2

        // ~25Hz UI waveform callback interval (40ms)
        private const val LEVEL_EMIT_INTERVAL_MS = 40L
    }

    private enum class StreamPhase {
        RUNNING,
        STOPPING,
        CANCELLING
    }

    private inner class ActiveVoiceSession(
        val streamId: Long,
        val boundAuth: SessionAuthSnapshot,
        val recorder: AudioRecord
    ) {
        @Volatile
        var phase: StreamPhase = StreamPhase.RUNNING

        @Volatile
        var stopRequestId: String = ""

        @Volatile
        var cancelReason: String = "cancelled"

        val cancelSent = AtomicBoolean(false)
        var workerThread: Thread? = null
    }

    private val controllerLock = Any()
    private val nextStreamId = AtomicLong(1L)
    private var activeSession: ActiveVoiceSession? = null

    // Legacy v1 fallback state (startAudioCapture / stopAudioCapture)
    private val legacyCapturing = AtomicBoolean(false)
    private var legacyThread: Thread? = null

    fun isCapturing(): Boolean =
        synchronized(controllerLock) { activeSession != null } || legacyCapturing.get()

    @SuppressLint("MissingPermission")
    fun startVoiceStream(requestId: String): Double {
        if (!hasRecordPermission()) {
            onRequestRecordPermission()
            return 0.0
        }
        if (!arbiter.hasActiveSocketAndAuth()) {
            return 0.0
        }

        // Cleanly cancel any lingering previous stream before starting a new utterance
        cancelActiveInternal(targetStreamId = 0L, reason = "superseded", sendWireCancel = true)
        stopLegacyCapture()

        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE_HZ, CHANNEL_CONFIG, AUDIO_ENCODING)
        if (minBuf <= 0) {
            return 0.0
        }

        val recorder = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE_HZ,
                CHANNEL_CONFIG,
                AUDIO_ENCODING,
                maxOf(minBuf, FRAME_BYTES * 8)
            )
        } catch (_: Exception) {
            return 0.0
        }

        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            try {
                recorder.release()
            } catch (_: Exception) {
            }
            return 0.0
        }

        val streamId = nextStreamId.getAndIncrement()
        val reqId = requestId.ifBlank { "voice-begin-$streamId" }

        synchronized(controllerLock) {
            val boundAuth = arbiter.sendVoiceBegin(streamId, reqId)
            if (boundAuth == null) {
                try {
                    recorder.release()
                } catch (_: Exception) {
                }
                return 0.0
            }

            val session = ActiveVoiceSession(
                streamId = streamId,
                boundAuth = boundAuth,
                recorder = recorder
            )
            val thread = Thread(
                { runVoiceCaptureLoop(session) },
                "axonkey-aka1-voice-$streamId"
            )
            session.workerThread = thread
            activeSession = session
            thread.start()
        }

        return streamId.toDouble()
    }

    fun stopVoiceStream(streamIdDouble: Double, requestId: String) {
        val targetId = if (streamIdDouble.isFinite()) streamIdDouble.toLong() else 0L
        synchronized(controllerLock) {
            val session = activeSession ?: return
            if (targetId > 0L && session.streamId != targetId) return
            if (session.phase == StreamPhase.RUNNING) {
                session.stopRequestId = requestId.ifBlank { "voice-end-${session.streamId}" }
                session.phase = StreamPhase.STOPPING
            }
        }
    }

    fun cancelVoiceStream(streamIdDouble: Double, reason: String) {
        val targetId = if (streamIdDouble.isFinite()) streamIdDouble.toLong() else 0L
        cancelActiveInternal(
            targetStreamId = targetId,
            reason = reason.ifBlank { "cancelled" },
            sendWireCancel = true
        )
    }

    fun onPause() {
        cancelActiveInternal(targetStreamId = 0L, reason = "paused", sendWireCancel = true)
        stopLegacyCapture()
    }

    fun onSocketClosedOrFailed() {
        cancelActiveInternal(targetStreamId = 0L, reason = "disconnected", sendWireCancel = false)
        stopLegacyCapture()
    }

    fun onAuthInvalidated() {
        cancelActiveInternal(targetStreamId = 0L, reason = "auth_revoked", sendWireCancel = false)
        stopLegacyCapture()
    }

    @SuppressLint("MissingPermission")
    fun startLegacyCapture(): Boolean {
        if (!hasRecordPermission()) {
            onRequestRecordPermission()
            return false
        }
        stopLegacyCapture()
        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE_HZ, CHANNEL_CONFIG, AUDIO_ENCODING)
        if (minBuf <= 0) return false
        val legacyFrameBytes = 640 // 20ms @ 16kHz mono s16le

        val recorder = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE_HZ,
                CHANNEL_CONFIG,
                AUDIO_ENCODING,
                maxOf(minBuf, legacyFrameBytes * 4)
            )
        } catch (_: Exception) {
            return false
        }
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            return false
        }

        legacyCapturing.set(true)
        legacyThread = Thread({
            Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
            val buf = ByteArray(legacyFrameBytes)
            try {
                recorder.startRecording()
                while (legacyCapturing.get() && !Thread.currentThread().isInterrupted) {
                    val read = recorder.read(buf, 0, buf.size)
                    val validBytes = read and -2
                    if (validBytes > 0) {
                        if (!arbiter.sendRawBinary(buf.toByteString(0, validBytes))) {
                            break
                        }
                    }
                }
            } catch (_: Exception) {
            } finally {
                try {
                    recorder.stop()
                } catch (_: Exception) {
                }
                recorder.release()
                legacyCapturing.set(false)
            }
        }, "axonkey-legacy-pcm").apply { start() }
        return true
    }

    fun stopLegacyCapture() {
        legacyCapturing.set(false)
        legacyThread?.interrupt()
        legacyThread = null
    }

    private fun cancelActiveInternal(
        targetStreamId: Long,
        reason: String,
        sendWireCancel: Boolean
    ) {
        val sessionToCancel: ActiveVoiceSession?
        synchronized(controllerLock) {
            val current = activeSession ?: return
            if (targetStreamId > 0L && current.streamId != targetStreamId) return
            current.cancelReason = reason
            current.phase = StreamPhase.CANCELLING
            activeSession = null
            sessionToCancel = current
        }

        val session = sessionToCancel ?: return
        if (sendWireCancel && session.cancelSent.compareAndSet(false, true)) {
            arbiter.sendVoiceCancel(
                targetSessionId = session.boundAuth.sessionId,
                targetInputEpoch = session.boundAuth.inputEpoch,
                streamId = session.streamId,
                reason = reason
            )
        }
        try {
            session.recorder.stop()
        } catch (_: Exception) {
        }
        session.workerThread?.interrupt()
        onVoiceLevel(0.0)
    }

    private fun runVoiceCaptureLoop(session: ActiveVoiceSession) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        val pcmBuf = ByteArray(FRAME_BYTES)
        var sampleIndex = 0L
        var smoothedLevel = 0.0
        var lastLevelEmitMs = 0L
        var sendFailed = false

        try {
            session.recorder.startRecording()

            while (session.phase == StreamPhase.RUNNING && !Thread.currentThread().isInterrupted) {
                val readBytes = session.recorder.read(pcmBuf, 0, FRAME_BYTES)
                if (session.phase == StreamPhase.CANCELLING) break

                val validBytes = if (readBytes > 0) (readBytes and -2) else 0
                if (validBytes > 0) {
                    val ok = arbiter.sendVoicePcmFrame(
                        expectedSessionId = session.boundAuth.sessionId,
                        expectedInputGeneration = session.boundAuth.inputGeneration,
                        streamId = session.streamId,
                        firstSampleIndex = sampleIndex,
                        pcmBytes = pcmBuf,
                        pcmByteLen = validBytes
                    )
                    if (!ok) {
                        sendFailed = true
                        break
                    }
                    sampleIndex += (validBytes / 2).toLong()

                    val instLevel = computePerceptualLevel(pcmBuf, validBytes)
                    smoothedLevel = if (instLevel >= smoothedLevel) {
                        0.55 * instLevel + 0.45 * smoothedLevel
                    } else {
                        0.25 * instLevel + 0.75 * smoothedLevel
                    }

                    val nowMs = SystemClock.elapsedRealtime()
                    if (nowMs - lastLevelEmitMs >= LEVEL_EMIT_INTERVAL_MS) {
                        lastLevelEmitMs = nowMs
                        onVoiceLevel(smoothedLevel.coerceIn(0.0, 1.0))
                    }
                } else if (readBytes < 0) {
                    break
                }
            }

            // Normal release path: stop hardware capture, drain remaining buffered samples,
            // send final AKA1 frame, and THEN stamp & send voice.end(finalSampleExclusive)!
            if (!sendFailed && session.phase == StreamPhase.STOPPING) {
                try {
                    session.recorder.stop()
                } catch (_: Exception) {
                }

                // Drain up to 40ms (4 x 10ms frames) of residual already-captured samples in AudioRecord
                var drainRounds = 0
                while (drainRounds < 4 && session.phase == StreamPhase.STOPPING) {
                    drainRounds++
                    val tailBytes = try {
                        session.recorder.read(
                            pcmBuf,
                            0,
                            FRAME_BYTES,
                            AudioRecord.READ_NON_BLOCKING
                        )
                    } catch (_: Exception) {
                        0
                    }
                    val validTail = if (tailBytes > 0) (tailBytes and -2) else 0
                    if (validTail <= 0) break

                    val ok = arbiter.sendVoicePcmFrame(
                        expectedSessionId = session.boundAuth.sessionId,
                        expectedInputGeneration = session.boundAuth.inputGeneration,
                        streamId = session.streamId,
                        firstSampleIndex = sampleIndex,
                        pcmBytes = pcmBuf,
                        pcmByteLen = validTail
                    )
                    if (!ok) {
                        sendFailed = true
                        break
                    }
                    sampleIndex += (validTail / 2).toLong()
                }

                if (!sendFailed && session.phase == StreamPhase.STOPPING) {
                    arbiter.sendVoiceEnd(
                        expectedSessionId = session.boundAuth.sessionId,
                        expectedInputGeneration = session.boundAuth.inputGeneration,
                        streamId = session.streamId,
                        requestId = session.stopRequestId.ifBlank { "voice-end-${session.streamId}" },
                        finalSampleExclusive = sampleIndex
                    )
                }
            } else if (sendFailed && session.phase != StreamPhase.CANCELLING) {
                if (session.cancelSent.compareAndSet(false, true)) {
                    arbiter.sendVoiceCancel(
                        targetSessionId = session.boundAuth.sessionId,
                        targetInputEpoch = session.boundAuth.inputEpoch,
                        streamId = session.streamId,
                        reason = "capture_abort"
                    )
                }
            }
        } catch (_: Exception) {
            if (session.phase != StreamPhase.CANCELLING && session.cancelSent.compareAndSet(false, true)) {
                arbiter.sendVoiceCancel(
                    targetSessionId = session.boundAuth.sessionId,
                    targetInputEpoch = session.boundAuth.inputEpoch,
                    streamId = session.streamId,
                    reason = "capture_error"
                )
            }
        } finally {
            try {
                if (session.recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                    session.recorder.stop()
                }
            } catch (_: Exception) {
            }
            try {
                session.recorder.release()
            } catch (_: Exception) {
            }
            synchronized(controllerLock) {
                if (activeSession === session) {
                    activeSession = null
                }
            }
            onVoiceLevel(0.0)
        }
    }

    private fun computePerceptualLevel(pcmBytes: ByteArray, byteLen: Int): Double {
        val sampleCount = byteLen / 2
        if (sampleCount <= 0) return 0.0
        var sumSquares = 0.0
        var idx = 0
        while (idx + 1 < byteLen) {
            val lo = pcmBytes[idx].toInt() and 0xFF
            val hi = pcmBytes[idx + 1].toInt() // sign-extended
            val sample = (hi shl 8) or lo
            val norm = sample / 32768.0
            sumSquares += norm * norm
            idx += 2
        }
        val rms = sqrt(sumSquares / sampleCount)
        val db = 20.0 * log10(max(rms, 1e-5))
        // Map [-48 dBFS .. -8 dBFS] onto [0.0 .. 1.0] with gentle perceptual curve
        val linear = ((db + 48.0) / 40.0).coerceIn(0.0, 1.0)
        return linear.pow(0.75)
    }

    private fun hasRecordPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }
}
