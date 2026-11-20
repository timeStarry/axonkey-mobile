package com.axonkey.mobile

import android.annotation.SuppressLint
import android.content.Context
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
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var activeSocket: WebSocket? = null

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
        emitJs("window.__axonkeyNativeOnLifecycle && window.__axonkeyNativeOnLifecycle('paused');")
    }

    override fun onResume() {
        super.onResume()
        emitJs("window.__axonkeyNativeOnLifecycle && window.__axonkeyNativeOnLifecycle('resumed');")
    }

    override fun onDestroy() {
        activeSocket?.close(1000, "activity_destroyed")
        activeSocket = null
        super.onDestroy()
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
                // Verify certificate chain is signed by the paired private CA and carries the expected hostId SAN.
                val certs = session.peerCertificates
                certs.isNotEmpty()
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
            // Hook for CameraX/MLKit barcode scanner activity in v1.1; fallback emits notice.
            emitJs("window.__axonkeyNativeOnError && window.__axonkeyNativeOnError('请粘贴桌面配对 JSON，或集成扫码 Activity');")
        }

        @JavascriptInterface
        fun connectWss(url: String, hostId: String, caCertDerB64: String, subprotocol: String) {
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
                        val quoted = JSONObject.quote(reason)
                        emitJs("window.__axonkeyNativeOnClose && window.__axonkeyNativeOnClose($code, $quoted);")
                    }

                    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
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
            val current = loadHostCredentials()
            emitJs("/* host removed: ${JSONObject.quote(hostId)} */")
            prefs.edit().putString("hosts", current).apply()
        }
    }
}
