package com.axonkey.mobile

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Low-latency procedural mechanical micro-switch sound synthesizer.
 *
 * Synthesizes ultra-short (4.5ms–12ms) exponentially damped 48kHz PCM16 transients once into
 * app cache and preloads them into Android [SoundPool] under `USAGE_ASSISTANCE_SONIFICATION`,
 * delivering crisp, hardware-grade tactile acoustics without mushy OS water-drop sounds.
 */
class TactileSoundPlayer(context: Context) {
    companion object {
        private const val SAMPLE_RATE = 48_000
        private const val CACHE_DIR_NAME = "tactile_sfx_v1"
    }

    private val appContext = context.applicationContext
    private val loadedIds = ConcurrentHashMap<String, Int>()
    private val readyIds = ConcurrentHashMap.newKeySet<Int>()
    private val initExecutor = Executors.newSingleThreadExecutor()

    @Volatile
    private var released = false

    private val soundPool: SoundPool = SoundPool.Builder()
        .setMaxStreams(4)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        .build()
        .apply {
            setOnLoadCompleteListener { _, sampleId, status ->
                if (status == 0) {
                    readyIds.add(sampleId)
                }
            }
        }

    init {
        initExecutor.execute {
            runCatching {
                val dir = File(appContext.cacheDir, CACHE_DIR_NAME)
                if (!dir.exists()) {
                    dir.mkdirs()
                }
                preloadTransient(dir, "tap", synthesizeTap())
                preloadTransient(dir, "detent", synthesizeDetent())
                preloadTransient(dir, "confirm", synthesizeConfirm())
                preloadTransient(dir, "heavy", synthesizeHeavy())
            }
        }
    }

    fun play(kind: String) {
        if (released) return
        val normalized = when (kind) {
            "detent" -> "detent"
            "confirm", "recenter" -> "confirm"
            "heavy" -> "heavy"
            "voiceStart", "voiceStop", "error" -> return
            else -> "tap"
        }
        val sampleId = loadedIds[normalized] ?: return
        if (!readyIds.contains(sampleId)) return

        val gain = when (normalized) {
            "detent" -> 0.20f
            "confirm" -> 0.30f
            "heavy" -> 0.34f
            else -> 0.27f
        }
        runCatching {
            soundPool.play(sampleId, gain, gain, 1, 0, 1.0f)
        }
    }

    fun release() {
        released = true
        initExecutor.shutdownNow()
        runCatching {
            soundPool.release()
        }
    }

    private fun preloadTransient(dir: File, name: String, pcmSamples: ShortArray) {
        if (released) return
        val wavFile = File(dir, "$name.wav")
        if (!wavFile.exists() || wavFile.length() < 64L) {
            writeMonoWav16(wavFile, pcmSamples)
        }
        if (!released) {
            val id = soundPool.load(wavFile.absolutePath, 1)
            if (id > 0) {
                loadedIds[name] = id
            }
        }
    }

    /** Crisp ~6.5ms machined aluminum micro-switch click (`tap`). */
    private fun synthesizeTap(): ShortArray {
        val count = (SAMPLE_RATE * 0.0065).roundToInt()
        val out = ShortArray(count)
        for (i in 0 until count) {
            val t = i.toDouble() / SAMPLE_RATE
            val attack = (i.coerceAtMost(14)).toDouble() / 14.0
            val env = attack * exp(-t / 0.00135)
            val snap = exp(-t / 0.00035) * sin(2.0 * PI * 4_200.0 * t)
            val body = 0.68 * sin(2.0 * PI * 1_920.0 * t) + 0.32 * sin(2.0 * PI * 3_540.0 * t)
            val sample = ((0.72 * body * env + 0.28 * snap) * 24_000.0).roundToInt()
            out[i] = sample.coerceIn(-32767, 32767).toShort()
        }
        return out
    }

    /** Ultra-tight ~4.5ms rotary wheel / sector detent tick (`detent`). */
    private fun synthesizeDetent(): ShortArray {
        val count = (SAMPLE_RATE * 0.0045).roundToInt()
        val out = ShortArray(count)
        for (i in 0 until count) {
            val t = i.toDouble() / SAMPLE_RATE
            val attack = (i.coerceAtMost(10)).toDouble() / 10.0
            val env = attack * exp(-t / 0.0009)
            val wave = 0.65 * sin(2.0 * PI * 2_480.0 * t) + 0.35 * sin(2.0 * PI * 4_600.0 * t)
            val sample = (wave * env * 21_000.0).roundToInt()
            out[i] = sample.coerceIn(-32767, 32767).toShort()
        }
        return out
    }

    /** Positive ~12ms dual-latch acoustic click (`confirm` / `recenter`). */
    private fun synthesizeConfirm(): ShortArray {
        val count = (SAMPLE_RATE * 0.0125).roundToInt()
        val out = ShortArray(count)
        val secondOffset = 0.0048
        for (i in 0 until count) {
            val t = i.toDouble() / SAMPLE_RATE
            val env1 = ((i.coerceAtMost(12)).toDouble() / 12.0) * exp(-t / 0.0013)
            val w1 = sin(2.0 * PI * 1_720.0 * t) * env1 * 0.62

            val w2 = if (t >= secondOffset) {
                val t2 = t - secondOffset
                val idx2 = ((t2 * SAMPLE_RATE).roundToInt()).coerceAtMost(12)
                val env2 = (idx2.toDouble() / 12.0) * exp(-t2 / 0.00155)
                (0.75 * sin(2.0 * PI * 2_360.0 * t2) + 0.25 * sin(2.0 * PI * 3_800.0 * t2)) * env2 * 0.85
            } else {
                0.0
            }

            val sample = ((w1 + w2) * 23_500.0).roundToInt()
            out[i] = sample.coerceIn(-32767, 32767).toShort()
        }
        return out
    }

    /** Deeper ~9.5ms damped mechanical thock (`heavy`). */
    private fun synthesizeHeavy(): ShortArray {
        val count = (SAMPLE_RATE * 0.0095).roundToInt()
        val out = ShortArray(count)
        for (i in 0 until count) {
            val t = i.toDouble() / SAMPLE_RATE
            val attack = (i.coerceAtMost(16)).toDouble() / 16.0
            val env = attack * exp(-t / 0.0021)
            val wave = 0.72 * sin(2.0 * PI * 1_040.0 * t) + 0.28 * sin(2.0 * PI * 2_080.0 * t)
            val sample = (wave * env * 26_000.0).roundToInt()
            out[i] = sample.coerceIn(-32767, 32767).toShort()
        }
        return out
    }

    private fun writeMonoWav16(target: File, samples: ShortArray) {
        val dataBytes = samples.size * 2
        val buf = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray(Charsets.US_ASCII))
        buf.putInt(36 + dataBytes)
        buf.put("WAVE".toByteArray(Charsets.US_ASCII))
        buf.put("fmt ".toByteArray(Charsets.US_ASCII))
        buf.putInt(16) // PCM chunk size
        buf.putShort(1) // PCM format = 1
        buf.putShort(1) // Channels = 1 (mono)
        buf.putInt(SAMPLE_RATE)
        buf.putInt(SAMPLE_RATE * 2) // ByteRate
        buf.putShort(2) // BlockAlign
        buf.putShort(16) // BitsPerSample
        buf.put("data".toByteArray(Charsets.US_ASCII))
        buf.putInt(dataBytes)
        for (s in samples) {
            buf.putShort(s)
        }
        FileOutputStream(target).use { fos ->
            fos.write(buf.array())
        }
    }
}
