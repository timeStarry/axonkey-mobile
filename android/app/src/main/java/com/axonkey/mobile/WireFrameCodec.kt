package com.axonkey.mobile

import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import android.os.SystemClock
import okhttp3.WebSocket
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder

object WireFrameCodec {
    const val KIND_TRACKPAD_REL: Byte = 1
    const val KIND_GYRO_REL: Byte = 2
    const val KIND_GYRO_ABS: Byte = 3

    const val AKP1_FRAME_BYTES: Int = 40
    const val AKA1_HEADER_BYTES: Int = 32
    const val AKA1_MAX_PCM_BYTES: Int = 2560
    const val AKA1_FORMAT_PCM16LE_16K_MONO: Byte = 1

    fun nowSampleTimeUs(): Long = SystemClock.elapsedRealtimeNanos() / 1_000L

    fun encodeAkp1(
        kind: Byte,
        inputGeneration: Long,
        seq: Long,
        sampleTimeUs: Long,
        x: Float,
        y: Float
    ): ByteString? {
        if (inputGeneration <= 0L || seq <= 0L || !x.isFinite() || !y.isFinite()) {
            return null
        }
        val buf = ByteBuffer.allocate(AKP1_FRAME_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        buf.put('A'.code.toByte())
        buf.put('K'.code.toByte())
        buf.put('P'.code.toByte())
        buf.put('1'.code.toByte())
        buf.put(kind)
        buf.put(0.toByte()) // flags = 0
        buf.putShort(AKP1_FRAME_BYTES.toShort())
        buf.putLong(inputGeneration)
        buf.putLong(seq)
        buf.putLong(sampleTimeUs)
        buf.putFloat(x)
        buf.putFloat(y)
        return buf.array().toByteString(0, AKP1_FRAME_BYTES)
    }

    fun encodeAka1(
        inputGeneration: Long,
        streamId: Long,
        firstSampleIndex: Long,
        pcmBytes: ByteArray,
        pcmByteLen: Int
    ): ByteString? {
        if (
            inputGeneration <= 0L ||
            streamId <= 0L ||
            firstSampleIndex < 0L ||
            pcmByteLen <= 0 ||
            pcmByteLen > AKA1_MAX_PCM_BYTES ||
            (pcmByteLen and 1) != 0
        ) {
            return null
        }
        val totalBytes = AKA1_HEADER_BYTES + pcmByteLen
        val buf = ByteBuffer.allocate(totalBytes).order(ByteOrder.LITTLE_ENDIAN)
        buf.put('A'.code.toByte())
        buf.put('K'.code.toByte())
        buf.put('A'.code.toByte())
        buf.put('1'.code.toByte())
        buf.put(AKA1_FORMAT_PCM16LE_16K_MONO)
        buf.put(0.toByte()) // flags = 0
        buf.putShort(AKA1_HEADER_BYTES.toShort())
        buf.putLong(inputGeneration)
        buf.putLong(streamId)
        buf.putLong(firstSampleIndex)
        buf.put(pcmBytes, 0, pcmByteLen)
        return buf.array().toByteString(0, totalBytes)
    }
}

data class SessionAuthSnapshot(
    val sessionId: String,
    val inputEpoch: Long,
    val inputGeneration: Long,
    val leaseId: Long
) {
    val isAuthorized: Boolean
        get() = sessionId.isNotEmpty() && inputEpoch > 0L && inputGeneration > 0L
}

class OutboundArbiter {
    val sendLock = Any()

    private var activeSocket: WebSocket? = null
    private var nextSeq: Long = 1L

    private var sessionId: String = ""
    private var inputEpoch: Long = 0L
    private var inputGeneration: Long = 0L
    private var leaseId: Long = 0L

    private var pendingTrackpadDx: Double = 0.0
    private var pendingTrackpadDy: Double = 0.0
    private var pendingTrackpadTimeUs: Long = 0L
    private var hasPendingTrackpad: Boolean = false
    private var flushScheduled: Boolean = false

    private val outboundThread = HandlerThread(
        "axonkey-outbound",
        Process.THREAD_PRIORITY_DISPLAY
    ).apply { start() }
    private val outboundHandler = Handler(outboundThread.looper)

    private val flushRunnable = Runnable {
        synchronized(sendLock) {
            flushScheduled = false
            flushPendingTrackpadLocked()
        }
    }

    fun prepareNewConnection(): WebSocket? {
        synchronized(sendLock) {
            val prev = activeSocket
            activeSocket = null
            nextSeq = 1L
            clearAuthAndPendingLocked()
            return prev
        }
    }

    fun openSocket(factory: () -> WebSocket): WebSocket {
        synchronized(sendLock) {
            val socket = factory()
            activeSocket = socket
            nextSeq = 1L
            clearAuthAndPendingLocked()
            return socket
        }
    }

    fun isCurrentSocket(socket: WebSocket): Boolean {
        synchronized(sendLock) {
            return activeSocket === socket
        }
    }

    fun detachSocketIfCurrent(socket: WebSocket): Boolean {
        synchronized(sendLock) {
            if (activeSocket !== socket) return false
            activeSocket = null
            clearAuthAndPendingLocked()
            return true
        }
    }

    fun detachAndClose(code: Int, reason: String) {
        val socketToClose: WebSocket?
        synchronized(sendLock) {
            socketToClose = activeSocket
            activeSocket = null
            clearAuthAndPendingLocked()
        }
        socketToClose?.close(code, reason)
    }

    /**
     * Updates native session auth snapshot.
     * Returns Pair(previousAuth, currentAuth) so callers can react to session/auth loss.
     */
    fun updateSessionAuth(
        newSessionId: String,
        newInputEpoch: Long,
        newInputGeneration: Long,
        newLeaseId: Long
    ): Pair<SessionAuthSnapshot, SessionAuthSnapshot> {
        synchronized(sendLock) {
            val prev = currentAuthLocked()
            val trimmed = newSessionId.trim()
            if (trimmed.isEmpty()) {
                clearAuthAndPendingLocked()
            } else {
                if (trimmed != sessionId || newInputEpoch != inputEpoch || newInputGeneration != inputGeneration) {
                    clearPendingTrackpadLocked()
                }
                sessionId = trimmed
                inputEpoch = newInputEpoch
                inputGeneration = newInputGeneration
                leaseId = newLeaseId
            }
            return prev to currentAuthLocked()
        }
    }

    fun getAuthSnapshot(): SessionAuthSnapshot {
        synchronized(sendLock) {
            return currentAuthLocked()
        }
    }

    fun hasActiveSocketAndAuth(): Boolean {
        synchronized(sendLock) {
            return activeSocket != null && sessionId.isNotEmpty() && inputGeneration > 0L
        }
    }

    fun sendPointerDelta(dx: Double, dy: Double) {
        if (!dx.isFinite() || !dy.isFinite()) return
        if (dx == 0.0 && dy == 0.0) return
        val nowUs = WireFrameCodec.nowSampleTimeUs()
        synchronized(sendLock) {
            if (activeSocket == null || sessionId.isEmpty() || inputGeneration <= 0L) {
                return
            }
            pendingTrackpadDx += dx
            pendingTrackpadDy += dy
            pendingTrackpadTimeUs = nowUs
            hasPendingTrackpad = true
            if (!flushScheduled) {
                flushScheduled = true
                outboundHandler.post(flushRunnable)
            }
        }
    }

    fun flushPointerDelta(): Boolean {
        synchronized(sendLock) {
            flushScheduled = false
            outboundHandler.removeCallbacks(flushRunnable)
            return flushPendingTrackpadLocked()
        }
    }

    fun discardPendingPointerDelta() {
        synchronized(sendLock) {
            clearPendingTrackpadLocked()
        }
    }

    fun sendGyroRelative(dx: Float, dy: Float, sampleTimeUs: Long): Boolean {
        if (!dx.isFinite() || !dy.isFinite()) return false
        if (dx == 0f && dy == 0f) return false
        synchronized(sendLock) {
            val socket = activeSocket ?: return false
            if (sessionId.isEmpty() || inputGeneration <= 0L) return false
            val seq = nextSeq++
            val frame = WireFrameCodec.encodeAkp1(
                kind = WireFrameCodec.KIND_GYRO_REL,
                inputGeneration = inputGeneration,
                seq = seq,
                sampleTimeUs = sampleTimeUs,
                x = dx,
                y = dy
            ) ?: return false
            return socket.send(frame)
        }
    }

    fun sendGyroAbsolute(u: Float, v: Float, sampleTimeUs: Long): Boolean {
        if (!u.isFinite() || !v.isFinite()) return false
        val clampedU = u.coerceIn(0f, 1f)
        val clampedV = v.coerceIn(0f, 1f)
        synchronized(sendLock) {
            val socket = activeSocket ?: return false
            if (sessionId.isEmpty() || inputGeneration <= 0L) return false
            val seq = nextSeq++
            val frame = WireFrameCodec.encodeAkp1(
                kind = WireFrameCodec.KIND_GYRO_ABS,
                inputGeneration = inputGeneration,
                seq = seq,
                sampleTimeUs = sampleTimeUs,
                x = clampedU,
                y = clampedV
            ) ?: return false
            return socket.send(frame)
        }
    }

    fun sendControlFrame(jsonPayload: String): Boolean {
        synchronized(sendLock) {
            val socket = activeSocket ?: return false
            return try {
                val obj = JSONObject(jsonPayload)
                val msgType = obj.optString("type", "")
                if (msgType == "input.cancel" || msgType == "voice.cancel") {
                    clearPendingTrackpadLocked()
                } else {
                    flushPendingTrackpadLocked()
                }
                if (obj.has("seq") && obj.optLong("seq", -1L) == 0L) {
                    obj.put("seq", nextSeq++)
                }
                socket.send(obj.toString())
            } catch (_: Exception) {
                flushPendingTrackpadLocked()
                socket.send(jsonPayload)
            }
        }
    }

    fun sendRawText(payload: String): Boolean {
        synchronized(sendLock) {
            val socket = activeSocket ?: return false
            return socket.send(payload)
        }
    }

    fun sendRawBinary(bytes: ByteString): Boolean {
        synchronized(sendLock) {
            val socket = activeSocket ?: return false
            return socket.send(bytes)
        }
    }

    /**
     * Atomically flushes pending pointer delta, stamps seq, sends voice.begin,
     * and returns the bound SessionAuthSnapshot on success (or null on failure).
     */
    fun sendVoiceBegin(streamId: Long, requestId: String): SessionAuthSnapshot? {
        synchronized(sendLock) {
            val socket = activeSocket ?: return null
            val auth = currentAuthLocked()
            if (!auth.isAuthorized || auth.leaseId <= 0L) return null

            flushPendingTrackpadLocked()
            val seq = nextSeq++
            val msg = JSONObject().apply {
                put("type", "voice.begin")
                put("sessionId", auth.sessionId)
                put("inputEpoch", auth.inputEpoch)
                put("inputGeneration", auth.inputGeneration)
                put("seq", seq)
                put("leaseId", auth.leaseId)
                put("requestId", requestId)
                put("streamId", streamId)
            }
            return if (socket.send(msg.toString())) auth else null
        }
    }

    fun sendVoicePcmFrame(
        expectedSessionId: String,
        expectedInputGeneration: Long,
        streamId: Long,
        firstSampleIndex: Long,
        pcmBytes: ByteArray,
        pcmByteLen: Int
    ): Boolean {
        val frame = WireFrameCodec.encodeAka1(
            inputGeneration = expectedInputGeneration,
            streamId = streamId,
            firstSampleIndex = firstSampleIndex,
            pcmBytes = pcmBytes,
            pcmByteLen = pcmByteLen
        ) ?: return false

        synchronized(sendLock) {
            val socket = activeSocket ?: return false
            if (sessionId != expectedSessionId || inputGeneration != expectedInputGeneration) {
                return false
            }
            return socket.send(frame)
        }
    }

    fun sendVoiceEnd(
        expectedSessionId: String,
        expectedInputGeneration: Long,
        streamId: Long,
        requestId: String,
        finalSampleExclusive: Long
    ): Boolean {
        synchronized(sendLock) {
            val socket = activeSocket ?: return false
            if (sessionId != expectedSessionId || inputGeneration != expectedInputGeneration) {
                return false
            }
            val seq = nextSeq++
            val msg = JSONObject().apply {
                put("type", "voice.end")
                put("sessionId", sessionId)
                put("inputEpoch", inputEpoch)
                put("inputGeneration", inputGeneration)
                put("seq", seq)
                put("requestId", requestId)
                put("streamId", streamId)
                put("finalSampleExclusive", finalSampleExclusive)
            }
            return socket.send(msg.toString())
        }
    }

    fun sendVoiceCancel(
        targetSessionId: String,
        targetInputEpoch: Long,
        streamId: Long,
        reason: String
    ): Boolean {
        synchronized(sendLock) {
            val socket = activeSocket ?: return false
            val sid = targetSessionId.ifEmpty { sessionId }
            val epoch = if (targetInputEpoch > 0L) targetInputEpoch else inputEpoch
            if (sid.isEmpty() || streamId <= 0L) return false
            val msg = JSONObject().apply {
                put("type", "voice.cancel")
                put("sessionId", sid)
                put("inputEpoch", epoch)
                put("streamId", streamId)
                put("reason", reason.ifBlank { "cancelled" })
            }
            return socket.send(msg.toString())
        }
    }

    fun shutdown() {
        detachAndClose(1000, "activity_destroyed")
        outboundHandler.removeCallbacksAndMessages(null)
        outboundThread.quitSafely()
    }

    private fun currentAuthLocked(): SessionAuthSnapshot = SessionAuthSnapshot(
        sessionId = sessionId,
        inputEpoch = inputEpoch,
        inputGeneration = inputGeneration,
        leaseId = leaseId
    )

    private fun clearAuthAndPendingLocked() {
        sessionId = ""
        inputEpoch = 0L
        inputGeneration = 0L
        leaseId = 0L
        clearPendingTrackpadLocked()
    }

    private fun clearPendingTrackpadLocked() {
        pendingTrackpadDx = 0.0
        pendingTrackpadDy = 0.0
        pendingTrackpadTimeUs = 0L
        hasPendingTrackpad = false
        flushScheduled = false
        outboundHandler.removeCallbacks(flushRunnable)
    }

    private fun flushPendingTrackpadLocked(): Boolean {
        if (!hasPendingTrackpad) return false
        val dx = pendingTrackpadDx.toFloat()
        val dy = pendingTrackpadDy.toFloat()
        val sampleTimeUs = if (pendingTrackpadTimeUs > 0L) {
            pendingTrackpadTimeUs
        } else {
            WireFrameCodec.nowSampleTimeUs()
        }
        pendingTrackpadDx = 0.0
        pendingTrackpadDy = 0.0
        pendingTrackpadTimeUs = 0L
        hasPendingTrackpad = false

        val socket = activeSocket ?: return false
        if (sessionId.isEmpty() || inputGeneration <= 0L) return false
        if (!dx.isFinite() || !dy.isFinite() || (dx == 0f && dy == 0f)) return false

        val seq = nextSeq++
        val frame = WireFrameCodec.encodeAkp1(
            kind = WireFrameCodec.KIND_TRACKPAD_REL,
            inputGeneration = inputGeneration,
            seq = seq,
            sampleTimeUs = sampleTimeUs,
            x = dx,
            y = dy
        ) ?: return false
        return socket.send(frame)
    }
}
