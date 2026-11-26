import java.util.Base64

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseKeystorePath = System.getenv("ANDROID_KEYSTORE_PATH")?.trim().orEmpty()
val releaseKeystoreB64 = System.getenv("ANDROID_KEYSTORE_BASE64")?.trim().orEmpty()
val releaseKeystorePass = System.getenv("ANDROID_KEYSTORE_PASSWORD")?.trim().orEmpty()
val releaseKeyAlias = System.getenv("ANDROID_KEY_ALIAS")?.trim().orEmpty()
val releaseKeyPass = System.getenv("ANDROID_KEY_PASSWORD")?.trim().orEmpty()

val resolvedKeystoreFile: File? = when {
    releaseKeystorePath.isNotEmpty() && File(releaseKeystorePath).isFile -> File(releaseKeystorePath)
    releaseKeystoreB64.isNotEmpty() -> {
        val decoded = Base64.getDecoder().decode(releaseKeystoreB64)
        val tmpFile = layout.buildDirectory.file("tmp/signing/release.jks").get().asFile
        tmpFile.parentFile.mkdirs()
        tmpFile.writeBytes(decoded)
        tmpFile
    }
    else -> null
}

val hasReleaseSigning =
    resolvedKeystoreFile != null &&
        releaseKeystorePass.isNotEmpty() &&
        releaseKeyAlias.isNotEmpty() &&
        releaseKeyPass.isNotEmpty()

android {
    namespace = "com.axonkey.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.axonkey.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.2.2"
    }

    androidResources {
        localeFilters += listOf("zh", "en")
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = resolvedKeystoreFile
                storePassword = releaseKeystorePass
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    packaging {
        resources {
            excludes += setOf(
                "DebugProbesKt.bin",
                "kotlin-tooling-metadata.json",
                "kotlin/**",
                "META-INF/*.version",
                "META-INF/androidx.*",
                "META-INF/com.google.android.material_*",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/AL2.0",
                "META-INF/LGPL2.1",
                "okhttp3/internal/publicsuffix/*"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0") {
        isTransitive = false
    }
    implementation("com.google.zxing:core:3.5.3")
}
