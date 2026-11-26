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
 * Profile C ("Leica M Ratchet & Shutter Dial") procedural mechanical sound synthesizer.
 *
 * Uses `USAGE_GAME` + `CONTENT_TYPE_SONIFICATION` so explicit controller click sounds follow
 * the user's Media volume without stealing audio focus and without being muted by MIUI/HyperOS
 * system touch-sound settings. Each transient is framed in a 64ms 48kHz PCM16 buffer with a
 * subtle 3.5ms anti-gate pre-roll so smartphone SmartPA speaker amplifiers never swallow clicks.
 */
class TactileSoundPlayer(context: Context) {
    companion object {
        private const val SAMPLE_RATE = 48_000
        private const val TOTAL_BUFFER_SAMPLES = 3_072 // 64ms @ 48kHz prevents SoundPool / SmartPA truncation
        private const val PREROLL_SAMPLES = 168 // 3.5ms sub-audible amplifier wake-up lead-in
        private const val CACHE_DIR_NAME = "tactile_sfx_v3_leica"
    }

    private val appContext = context.applicationContext
    private val loadedIds = ConcurrentHashMap<String, Int>()
    private val readyIds = ConcurrentHashMap.newKeySet<Int>()
    private val initExecutor = Executors.newSingleThreadExecutor()

    @Volatile
    private var released = false

    private val soundPool: SoundPool = SoundPool.Builder()
        .setMaxStreams(6)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
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
            "detent" -> 0.62f
            "confirm" -> 0.82f
            "heavy" -> 0.88f
            else -> 0.76f
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
        if (!wavFile.exists() || wavFile.length() < 512L) {
            writeMonoWav16(wavFile, pcmSamples)
        }
        if (!released) {
            val id = soundPool.load(wavFile.absolutePath, 1)
            if (id > 0) {
                loadedIds[name] = id
            }
        }
    }

    private fun buildFramedBuffer(activeSeconds: Double, generator: (Double, Int) -> Double): ShortArray {
        val out = ShortArray(TOTAL_BUFFER_SAMPLES)
        val activeSamples = (SAMPLE_RATE * activeSeconds).roundToInt()
            .coerceAtMost(TOTAL_BUFFER_SAMPLES - PREROLL_SAMPLES)
        for (i in 0 until PREROLL_SAMPLES) {
            val w = sin(2.0 * PI * 250.0 * (i.toDouble() / SAMPLE_RATE)) * 12.0
            out[i] = w.roundToInt().toShort()
        }
        for (i in 0 until activeSamples) {
            val t = i.toDouble() / SAMPLE_RATE
            val v = generator(t, i).coerceIn(-1.0, 1.0)
            out[PREROLL_SAMPLES + i] = (v * 30_000.0).roundToInt().coerceIn(-32767, 32767).toShort()
        }
        return out
    }

    /** Profile C (`tap`): ~15ms precision camera shutter micro-detent. */
    private fun synthesizeTap(): ShortArray = buildFramedBuffer(0.015) { t, i ->
        val attack = (i.coerceAtMost(10)).toDouble() / 10.0
        val body = 0.62 * exp(-t / 0.0018) * sin(2.0 * PI * 2_350.0 * t)
        val snap = 0.38 * exp(-t / 0.0007) * sin(2.0 * PI * 4_650.0 * t)
        attack * (body + snap) * 0.88
    }

    /** Profile C (`detent`): ~10ms Leica aperture ring pawl tick. */
    private fun synthesizeDetent(): ShortArray = buildFramedBuffer(0.010) { t, i ->
        val attack = (i.coerceAtMost(8)).toDouble() / 8.0
        val env = attack * exp(-t / 0.0012)
        (0.55 * sin(2.0 * PI * 2_850.0 * t) + 0.45 * sin(2.0 * PI * 5_200.0 * t)) * env * 0.76
    }

    /** Profile C (`confirm` / `recenter`): ~26ms crisp dual-pawl mechanical latch. */
    private fun synthesizeConfirm(): ShortArray = buildFramedBuffer(0.026) { t, _ ->
        val w1 = exp(-t / 0.0016) * sin(2.0 * PI * 2_400.0 * t) * 0.68
        val secondOffset = 0.0058
        val w2 = if (t >= secondOffset) {
            val t2 = t - secondOffset
            exp(-t2 / 0.0022) *
                (0.60 * sin(2.0 * PI * 3_100.0 * t2) + 0.40 * sin(2.0 * PI * 4_800.0 * t2)) *
                0.86
        } else {
            0.0
        }
        w1 + w2
    }

    /** Profile C (`heavy`): ~22ms solid brass/steel lock detent. */
    private fun synthesizeHeavy(): ShortArray = buildFramedBuffer(0.022) { t, i ->
        val attack = (i.coerceAtMost(12)).toDouble() / 12.0
        val body = exp(-t / 0.0028) * sin(2.0 * PI * 1_350.0 * t) * 0.75
        val edge = exp(-t / 0.0009) * sin(2.0 * PI * 3_900.0 * t) * 0.40
        attack * (body + edge)
    }

    private fun writeMonoWav16(target: File, samples: ShortArray) {
        val dataBytes = samples.size * 2
        val buf = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray(Charsets.US_ASCII))
        buf.putInt(36 + dataBytes)
        buf.put("WAVE".toByteArray(Charsets.US_ASCII))
        buf.put("fmt ".toByteArray(Charsets.US_ASCII))
        buf.putInt(16)
        buf.putShort(1)
        buf.putShort(1)
        buf.putInt(SAMPLE_RATE)
        buf.putInt(SAMPLE_RATE * 2)
        buf.putShort(2)
        buf.putShort(16)
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
