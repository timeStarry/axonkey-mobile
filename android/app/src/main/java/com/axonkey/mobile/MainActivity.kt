package com.axonkey.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
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
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.InetAddress
import java.net.Socket
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.util.Locale
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    private val arbiter = OutboundArbiter()
    private lateinit var gyroController: GyroController
    private lateinit var voiceController: VoiceCaptureController
    private lateinit var lanDiscoveryClient: LanDiscoveryClient

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
                performHaptic("error")
                emitJs("window.__axonkeyNativeOnError && window.__axonkeyNativeOnError('需要麦克风权限才能发送语音');")
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        gyroController = GyroController(
            context = this,
            arbiter = arbiter,
            onGyroStateChanged = { state ->
                val quoted = JSONObject.quote(state)
                emitJs("window.__axonkeyNativeOnGyroState && window.__axonkeyNativeOnGyroState($quoted);")
            },
            onRecenterHaptic = {
                performHaptic("recenter")
            }
        )

        voiceController = VoiceCaptureController(
            context = this,
            arbiter = arbiter,
            onRequestRecordPermission = {
                runOnUiThread {
                    if (!isDestroyed) {
                        audioPermLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            },
            onVoiceLevel = { level ->
                val formatted = String.format(Locale.US, "%.4f", level.coerceIn(0.0, 1.0))
                emitJs("window.__axonkeyNativeOnVoiceLevel && window.__axonkeyNativeOnVoiceLevel($formatted);")
            }
        )

        lanDiscoveryClient = LanDiscoveryClient(
            context = this,
            onHostsDiscovered = { jsonArrayString ->
                val quoted = JSONObject.quote(jsonArrayString)
                emitJs("window.__axonkeyNativeOnHostsDiscovered && window.__axonkeyNativeOnHostsDiscovered($quoted);")
            }
        )

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            overScrollMode = WebView.OVER_SCROLL_NEVER
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
            }
            addJavascriptInterface(AxonkeyNativeBridge(), "AxonkeyNative")
        }

        setContentView(webView)
        applyWindowSystemBarTheme(resolveSystemNightMode(resources.configuration))
        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val isDark = resolveSystemNightMode(newConfig)
        emitJs("window.__axonkeyNativeOnSystemDarkChanged && window.__axonkeyNativeOnSystemDarkChanged($isDark);")
    }

    private fun resolveSystemNightMode(config: Configuration): Boolean {
        return (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }

    @Suppress("DEPRECATION")
    private fun applyWindowSystemBarTheme(isDark: Boolean) {
        val statusBg = if (isDark) Color.parseColor("#0d1017") else Color.parseColor("#f4f6fb")
        val navBg = if (isDark) Color.parseColor("#0c0f16") else Color.parseColor("#e7ecf4")
        val canvasBg = if (isDark) Color.parseColor("#0a0c10") else Color.parseColor("#eef2f7")

        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        window.statusBarColor = statusBg
        window.navigationBarColor = navBg
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !isDark
            isAppearanceLightNavigationBars = !isDark
        }
        if (::webView.isInitialized) {
            webView.setBackgroundColor(canvasBg)
        }
    }

    override fun onPause() {
        super.onPause()
        arbiter.discardPendingPointerDelta()
        gyroController.onPause()
        voiceController.onPause()
        emitJs("window.__axonkeyNativeOnLifecycle && window.__axonkeyNativeOnLifecycle('paused');")
    }

    override fun onResume() {
        super.onResume()
        gyroController.onResume()
        emitJs("window.__axonkeyNativeOnLifecycle && window.__axonkeyNativeOnLifecycle('resumed');")
    }

    override fun onDestroy() {
        voiceController.onSocketClosedOrFailed()
        gyroController.destroy()
        lanDiscoveryClient.shutdown()
        arbiter.shutdown()
        super.onDestroy()
    }

    private fun emitJs(script: String) {
        runOnUiThread {
            if (!isDestroyed && ::webView.isInitialized) {
                webView.evaluateJavascript(script, null)
            }
        }
    }

    private fun resolveVibrator(): Vibrator? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun performHaptic(kind: String) {
        val vibrator = resolveVibrator() ?: return
        if (!vibrator.hasVibrator()) return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val composed = buildPrimitiveEffectApi30(vibrator, kind)
                if (composed != null) {
                    vibrator.vibrate(composed)
                    return
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                when (kind) {
                    "tap" -> {
                        vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
                        return
                    }
                    "confirm" -> {
                        vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
                        return
                    }
                    "heavy" -> {
                        vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK))
                        return
                    }
                    "recenter" -> {
                        vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_DOUBLE_CLICK))
                        return
                    }
                }
            }

            val effect = when (kind) {
                "tap" -> VibrationEffect.createOneShot(9L, 120)
                "confirm" -> VibrationEffect.createOneShot(14L, 190)
                "heavy" -> VibrationEffect.createOneShot(22L, 255)
                "voiceStart" -> VibrationEffect.createWaveform(
                    longArrayOf(0L, 10L, 20L, 16L),
                    intArrayOf(0, 130, 0, 235),
                    -1
                )
                "voiceStop" -> VibrationEffect.createWaveform(
                    longArrayOf(0L, 13L, 16L, 8L),
                    intArrayOf(0, 195, 0, 110),
                    -1
                )
                "recenter" -> VibrationEffect.createWaveform(
                    longArrayOf(0L, 11L, 32L, 15L),
                    intArrayOf(0, 180, 0, 255),
                    -1
                )
                "error" -> VibrationEffect.createWaveform(
                    longArrayOf(0L, 24L, 38L, 28L),
                    intArrayOf(0, 255, 0, 225),
                    -1
                )
                else -> VibrationEffect.createOneShot(10L, VibrationEffect.DEFAULT_AMPLITUDE)
            }
            vibrator.vibrate(effect)
        } catch (_: Exception) {
        }
    }

    private fun buildPrimitiveEffectApi30(vibrator: Vibrator, kind: String): VibrationEffect? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        val canClick = vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK)
        val canTick = vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_TICK)
        if (!canClick && !canTick) return null

        val comp = VibrationEffect.startComposition()
        return when (kind) {
            "tap" -> if (canTick) {
                comp.addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.65f).compose()
            } else null
            "confirm" -> if (canClick) {
                comp.addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.85f).compose()
            } else null
            "heavy" -> if (canClick) {
                comp.addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 1.0f).compose()
            } else null
            "voiceStart" -> if (canTick && canClick) {
                comp.addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.50f)
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.92f, 18)
                    .compose()
            } else null
            "voiceStop" -> if (canTick && canClick) {
                comp.addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.75f)
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.45f, 16)
                    .compose()
            } else null
            "recenter" -> if (canClick) {
                comp.addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.70f)
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 1.0f, 34)
                    .compose()
            } else null
            else -> null
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

        val lowLatencySslFactory = TcpNoDelaySslSocketFactory(sslContext.socketFactory)

        return OkHttpClient.Builder()
            .sslSocketFactory(lowLatencySslFactory, trustManager)
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
            performHaptic(kind)
        }

        @JavascriptInterface
        fun getDefaultDeviceName(): String {
            val manufacturer = (Build.MANUFACTURER ?: "").trim()
            val model = (Build.MODEL ?: "").trim()
            val combined = when {
                model.isEmpty() -> "Android 遥控器"
                manufacturer.isEmpty() || model.startsWith(manufacturer, ignoreCase = true) -> model
                else -> "${manufacturer.replaceFirstChar { it.uppercase() }} $model"
            }
            return combined.take(48)
        }

        @JavascriptInterface
        fun setKeepScreenOn(enabled: Boolean) {
            runOnUiThread {
                if (enabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        @JavascriptInterface
        fun isSystemDarkMode(): Boolean = resolveSystemNightMode(resources.configuration)

        @JavascriptInterface
        fun setSystemBarTheme(isDark: Boolean) {
            runOnUiThread {
                if (!isDestroyed) {
                    applyWindowSystemBarTheme(isDark)
                }
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
        fun startAudioCapture(): Boolean = voiceController.startLegacyCapture()

        @JavascriptInterface
        fun stopAudioCapture() {
            voiceController.stopLegacyCapture()
        }

        @JavascriptInterface
        fun connectWss(url: String, hostId: String, caCertDerB64: String, subprotocol: String) {
            voiceController.onSocketClosedOrFailed()
            gyroController.onAuthChanged(false)
            val prevSocket = arbiter.prepareNewConnection()
            prevSocket?.close(1000, "reconnect")

            try {
                val client = buildPinnedClient(hostId, caCertDerB64)
                val req = Request.Builder()
                    .url(url)
                    .header("Sec-WebSocket-Protocol", subprotocol)
                    .build()
                val listener = object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        if (!arbiter.isCurrentSocket(webSocket)) return
                        emitJs("window.__axonkeyNativeOnOpen && window.__axonkeyNativeOnOpen();")
                    }

                    override fun onMessage(webSocket: WebSocket, text: String) {
                        if (!arbiter.isCurrentSocket(webSocket)) return
                        val quoted = JSONObject.quote(text)
                        emitJs("window.__axonkeyNativeOnMessage && window.__axonkeyNativeOnMessage($quoted);")
                    }

                    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                        if (!arbiter.detachSocketIfCurrent(webSocket)) return
                        voiceController.onSocketClosedOrFailed()
                        gyroController.onAuthChanged(false)
                        webSocket.close(code, reason)
                        val quoted = JSONObject.quote(reason)
                        emitJs("window.__axonkeyNativeOnClose && window.__axonkeyNativeOnClose($code, $quoted);")
                    }

                    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                        if (!arbiter.detachSocketIfCurrent(webSocket)) return
                        voiceController.onSocketClosedOrFailed()
                        gyroController.onAuthChanged(false)
                        val quoted = JSONObject.quote(reason)
                        emitJs("window.__axonkeyNativeOnClose && window.__axonkeyNativeOnClose($code, $quoted);")
                    }

                    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                        if (!arbiter.detachSocketIfCurrent(webSocket)) return
                        voiceController.onSocketClosedOrFailed()
                        gyroController.onAuthChanged(false)
                        val quoted = JSONObject.quote(t.message ?: "TLS/WSS 连接失败")
                        emitJs("window.__axonkeyNativeOnError && window.__axonkeyNativeOnError($quoted);")
                        emitJs("window.__axonkeyNativeOnClose && window.__axonkeyNativeOnClose(1006, $quoted);")
                    }
                }
                arbiter.openSocket { client.newWebSocket(req, listener) }
            } catch (e: Exception) {
                val quoted = JSONObject.quote(e.message ?: "无法建立安全连接")
                emitJs("window.__axonkeyNativeOnError && window.__axonkeyNativeOnError($quoted);")
            }
        }

        @JavascriptInterface
        fun sendWssText(payload: String): Boolean = arbiter.sendRawText(payload)

        @JavascriptInterface
        fun closeWss(reason: String) {
            voiceController.onSocketClosedOrFailed()
            gyroController.onAuthChanged(false)
            arbiter.detachAndClose(1000, reason)
        }

        @JavascriptInterface
        fun syncSessionAuth(
            sessionId: String,
            inputEpoch: Double,
            inputGeneration: Double,
            leaseId: Double
        ) {
            val epochLong = if (inputEpoch.isFinite()) inputEpoch.toLong() else 0L
            val genLong = if (inputGeneration.isFinite()) inputGeneration.toLong() else 0L
            val leaseLong = if (leaseId.isFinite()) leaseId.toLong() else 0L

            val (prev, next) = arbiter.updateSessionAuth(
                newSessionId = sessionId,
                newInputEpoch = epochLong,
                newInputGeneration = genLong,
                newLeaseId = leaseLong
            )
            if (!next.isAuthorized) {
                voiceController.onAuthInvalidated()
                gyroController.onAuthChanged(false)
            } else {
                if (
                    prev.isAuthorized &&
                    (prev.sessionId != next.sessionId || prev.inputGeneration != next.inputGeneration)
                ) {
                    voiceController.onAuthInvalidated()
                }
                gyroController.onAuthChanged(true)
            }
        }

        @JavascriptInterface
        fun sendControlFrame(jsonPayload: String): Boolean = arbiter.sendControlFrame(jsonPayload)

        @JavascriptInterface
        fun sendPointerDelta(dx: Double, dy: Double) {
            arbiter.sendPointerDelta(dx, dy)
        }

        @JavascriptInterface
        fun flushPointerDelta() {
            arbiter.flushPointerDelta()
        }

        @JavascriptInterface
        fun setGyroConfig(mode: String, sensitivity: Double) {
            gyroController.setConfig(mode, sensitivity)
        }

        @JavascriptInterface
        fun setGyroClutch(engaged: Boolean) {
            gyroController.setClutch(engaged)
        }

        @JavascriptInterface
        fun recenterGyro() {
            gyroController.recenter()
        }

        @JavascriptInterface
        fun recenterCursor(): Boolean {
            gyroController.recenter()
            return arbiter.sendPointerRecenter()
        }

        @JavascriptInterface
        fun startVoiceStream(requestId: String): Double = voiceController.startVoiceStream(requestId)

        @JavascriptInterface
        fun stopVoiceStream(streamId: Double, requestId: String) {
            voiceController.stopVoiceStream(streamId, requestId)
        }

        @JavascriptInterface
        fun cancelVoiceStream(streamId: Double, reason: String) {
            voiceController.cancelVoiceStream(streamId, reason)
        }

        @JavascriptInterface
        fun discoverLanHosts(timeoutMs: Int) {
            lanDiscoveryClient.discover(timeoutMs)
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

/**
 * Enables TCP_NODELAY on every TLS WebSocket socket so 40-byte AKP1 pointer frames
 * and 10ms AKA1 voice frames are never delayed by Nagle's algorithm.
 */
private class TcpNoDelaySslSocketFactory(
    private val delegate: SSLSocketFactory
) : SSLSocketFactory() {
    override fun getDefaultCipherSuites(): Array<String> = delegate.defaultCipherSuites

    override fun getSupportedCipherSuites(): Array<String> = delegate.supportedCipherSuites

    override fun createSocket(s: Socket?, host: String?, port: Int, autoClose: Boolean): Socket =
        configure(delegate.createSocket(s, host, port, autoClose))

    override fun createSocket(host: String?, port: Int): Socket =
        configure(delegate.createSocket(host, port))

    override fun createSocket(
        host: String?,
        port: Int,
        localHost: InetAddress?,
        localPort: Int
    ): Socket = configure(delegate.createSocket(host, port, localHost, localPort))

    override fun createSocket(host: InetAddress?, port: Int): Socket =
        configure(delegate.createSocket(host, port))

    override fun createSocket(
        address: InetAddress?,
        port: Int,
        localAddress: InetAddress?,
        localPort: Int
    ): Socket = configure(delegate.createSocket(address, port, localAddress, localPort))

    override fun createSocket(): Socket = configure(delegate.createSocket())

    private fun configure(socket: Socket): Socket {
        try {
            socket.tcpNoDelay = true
        } catch (_: Exception) {
        }
        return socket
    }
}
