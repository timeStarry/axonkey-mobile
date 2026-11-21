package com.axonkey.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Base64
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var activeSocket: WebSocket? = null
    private val audioCapturing = AtomicBoolean(false)
    private var audioThread: Thread? = null

    private val qrScanLauncher = registerForActivityResult(ScanContract()) { result ->
        val raw = result.contents
        if (!raw.isNullOrBlank()) {
            val quoted = JSONObject.quote(raw)
            emitJs("window.__axonkeyNativeOnQrScanned && window.__axonkeyNativeOnQrScanned($quoted);")
        }
    }

    private val audioPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                emitJs("window.__axonkeyNativeOnError && window.__axonkeyNativeOnError('需要麦克风权限才能发送语音');")
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
            }
            addJavascriptInterface(AxonkeyNativeBridge(), "AxonkeyNative")
        }

        setContentView(webView)
        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    override fun onPause() {
        super.onPause()
        stopAudioInternal()
        emitJs("window.__axonkeyNativeOnLifecycle && window.__axonkeyNativeOnLifecycle('paused');")
    }

    override fun onResume() {
        super.onResume()
        emitJs("window.__axonkeyNativeOnLifecycle && window.__axonkeyNativeOnLifecycle('resumed');")
    }

    override fun onDestroy() {
        stopAudioInternal()
        activeSocket?.close(1000, "activity_destroyed")
        activeSocket = null
        super.onDestroy()
    }

    private fun stopAudioInternal() {
        audioCapturing.set(false)
        audioThread?.interrupt()
        audioThread = null
    }

    @SuppressLint("MissingPermission")
    private fun startAudioInternal(): Boolean {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            runOnUiThread { audioPermLauncher.launch(Manifest.permission.RECORD_AUDIO) }
            return false
        }
        val socket = activeSocket ?: return false
        stopAudioInternal()

        val sampleRate = 16000
        val channelConfig = AudioFormat.CHANNEL_IN_MONO
        val encoding = AudioFormat.ENCODING_PCM_16BIT
        val minBuf = AudioRecord.getMinBufferSize(sampleRate, channelConfig, encoding)
        if (minBuf <= 0) return false
        val frameBytes = 640 // 20ms @ 16kHz mono s16le

        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate,
            channelConfig,
            encoding,
            maxOf(minBuf, frameBytes * 4)
        )
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            return false
        }

        audioCapturing.set(true)
        audioThread = Thread {
            val buf = ByteArray(frameBytes)
            try {
                recorder.startRecording()
                while (audioCapturing.get() && !Thread.currentThread().isInterrupted) {
                    val read = recorder.read(buf, 0, buf.size)
                    if (read > 0) {
                        if (!socket.send(buf.toByteString(0, read))) {
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
                audioCapturing.set(false)
            }
        }.apply {
            name = "axonkey-pcm-capture"
            start()
        }
        return true
    }

    private fun emitJs(script: String) {
        runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun buildPinnedClient(hostId: String, caCertDerB64: String): OkHttpClient {
        val derBytes = Base64.decode(caCertDerB64, Base64.DEFAULT)
        val cf = CertificateFactory.getInstance("X.509")
        val caCert = cf.generateCertificate(ByteArrayInputStream(derBytes))

        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null, null)
            setCertificateEntry("axonkey-ca-$hostId", caCert)
        }
        val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
            init(keyStore)
        }
        val trustManager = tmf.trustManagers.first { it is X509TrustManager } as X509TrustManager
        val sslContext = SSLContext.getInstance("TLS").apply {
            init(null, arrayOf(trustManager), null)
        }

        return OkHttpClient.Builder()
            .sslSocketFactory(sslContext.socketFactory, trustManager)
            .hostnameVerifier { _, session ->
                session.peerCertificates.isNotEmpty()
            }
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()
    }

    inner class AxonkeyNativeBridge {
        private val prefs = getSharedPreferences("axonkey_mobile_creds", Context.MODE_PRIVATE)

        @JavascriptInterface
        fun haptic(kind: String) {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            val durationMs = when (kind) {
                "heavy" -> 22L
                "error" -> 35L
                "confirm" -> 16L
                else -> 10L
            }
            vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
        }

        @JavascriptInterface
        fun setKeepScreenOn(enabled: Boolean) {
            runOnUiThread {
                if (enabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        @JavascriptInterface
        fun openQrScanner() {
            runOnUiThread {
                val options = ScanOptions().apply {
                    setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    setPrompt("扫描桌面端 Axonkey 配对二维码")
                    setBeepEnabled(false)
                    setOrientationLocked(true)
                    setBarcodeImageEnabled(false)
                }
                qrScanLauncher.launch(options)
            }
        }

        @JavascriptInterface
        fun startAudioCapture(): Boolean = startAudioInternal()

        @JavascriptInterface
        fun stopAudioCapture() {
            stopAudioInternal()
        }

        @JavascriptInterface
        fun connectWss(url: String, hostId: String, caCertDerB64: String, subprotocol: String) {
            stopAudioInternal()
            activeSocket?.close(1000, "reconnect")
            try {
                val client = buildPinnedClient(hostId, caCertDerB64)
                val req = Request.Builder()
                    .url(url)
                    .header("Sec-WebSocket-Protocol", subprotocol)
                    .build()
                activeSocket = client.newWebSocket(req, object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        emitJs("window.__axonkeyNativeOnOpen && window.__axonkeyNativeOnOpen();")
                    }

                    override fun onMessage(webSocket: WebSocket, text: String) {
                        val quoted = JSONObject.quote(text)
                        emitJs("window.__axonkeyNativeOnMessage && window.__axonkeyNativeOnMessage($quoted);")
                    }

                    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                        stopAudioInternal()
                        val quoted = JSONObject.quote(reason)
                        emitJs("window.__axonkeyNativeOnClose && window.__axonkeyNativeOnClose($code, $quoted);")
                    }

                    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                        stopAudioInternal()
                        val quoted = JSONObject.quote(t.message ?: "TLS/WSS 连接失败")
                        emitJs("window.__axonkeyNativeOnError && window.__axonkeyNativeOnError($quoted);")
                        emitJs("window.__axonkeyNativeOnClose && window.__axonkeyNativeOnClose(1006, $quoted);")
                    }
                })
            } catch (e: Exception) {
                val quoted = JSONObject.quote(e.message ?: "无法建立安全连接")
                emitJs("window.__axonkeyNativeOnError && window.__axonkeyNativeOnError($quoted);")
            }
        }

        @JavascriptInterface
        fun sendWssText(payload: String): Boolean = activeSocket?.send(payload) ?: false

        @JavascriptInterface
        fun closeWss(reason: String) {
            stopAudioInternal()
            activeSocket?.close(1000, reason)
            activeSocket = null
        }

        @JavascriptInterface
        fun saveHostCredentials(json: String) {
            prefs.edit().putString("hosts", json).apply()
        }

        @JavascriptInterface
        fun loadHostCredentials(): String = prefs.getString("hosts", "[]") ?: "[]"

        @JavascriptInterface
        fun deleteHostCredentials(hostId: String) {
            try {
                val arr = JSONArray(loadHostCredentials())
                val next = JSONArray()
                for (i in 0 until arr.length()) {
                    val item = arr.optJSONObject(i)
                    if (item != null && item.optString("hostId") != hostId) {
                        next.put(item)
                    }
                }
                prefs.edit().putString("hosts", next.toString()).apply()
            } catch (_: Exception) {
                prefs.edit().putString("hosts", "[]").apply()
            }
        }
    }
}
