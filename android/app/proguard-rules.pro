# Keep WebView @JavascriptInterface bridge methods intact under R8 full mode
-keepattributes JavascriptInterface
-keepclassmembers class com.axonkey.mobile.MainActivity$AxonkeyNativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep ZXing portrait CaptureActivity entry point
-keep class com.journeyapps.barcodescanner.CaptureActivity { *; }

# Unused optional classes inside transitive-stripped ZXing & OkHttp platform providers
-dontwarn androidx.fragment.**
-dontwarn androidx.appcompat.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
