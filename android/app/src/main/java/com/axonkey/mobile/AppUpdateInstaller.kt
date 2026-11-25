package com.axonkey.mobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class AppUpdateInstaller(
    private val context: Context,
    private val onUpdateRelease: (String) -> Unit,
    private val onUpdateProgress: (String) -> Unit,
    private val onRequestInstallPermission: () -> Unit
) {
    companion object {
        private const val DEFAULT_REPO_SLUG = "timeStarry/axonkey-mobile"
        private const val PROGRESS_THROTTLE_MS = 80L
        private const val MAX_APK_BYTES = 150L * 1024L * 1024L
        private val REPO_SLUG_REGEX = Regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
        private val HEX_64_REGEX = Regex("^[a-fA-F0-9]{64}$")
        private val GENERIC_SHA256_REGEX =
            Regex("(?i)sha-?256[:\\s=`*]+([a-fA-F0-9]{64})")
    }

    private val ioExecutor: ExecutorService = Executors.newCachedThreadPool()
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    private val apkUpdatesDir = File(context.cacheDir, "updates")
    private val isDownloading = AtomicBoolean(false)

    @Volatile
    private var pendingApkFile: File? = null

    private fun resolveVersionPair(): Pair<String, Long> {
        var versionName = "0.2.0"
        var versionCode = 2L
        try {
            val pkgInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (!pkgInfo.versionName.isNullOrBlank()) {
                versionName = pkgInfo.versionName!!
            }
            versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pkgInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                pkgInfo.versionCode.toLong()
            }
        } catch (_: Exception) {
        }
        return versionName to versionCode
    }

    private fun buildUserAgent(): String = "AxonkeyMobile/${resolveVersionPair().first}"

    fun getAppVersionInfoJson(): String {
        val (versionName, versionCode) = resolveVersionPair()
        return JSONObject().apply {
            put("versionName", versionName)
            put("versionCode", versionCode)
            put("packageName", context.packageName)
        }.toString()
    }

    fun checkLatestGithubRelease(repoSlug: String) {
        val cleanSlug = normalizeRepoSlug(repoSlug)
        if (cleanSlug == null) {
            emitReleaseError("network_error", "无效的 GitHub 仓库地址")
            return
        }

        try {
            ioExecutor.execute {
                try {
                    val req = Request.Builder()
                        .url("https://api.github.com/repos/$cleanSlug/releases/latest")
                        .get()
                        .header("Accept", "application/vnd.github+json")
                        .header("User-Agent", buildUserAgent())
                        .build()

                    httpClient.newCall(req).execute().use { resp ->
                        if (resp.code == 404) {
                            emitReleaseError("no_release", "仓库暂无已发布的 Release 版本")
                            return@execute
                        }
                        if (!resp.isSuccessful) {
                            emitReleaseError(
                                "network_error",
                                "检查更新失败 (HTTP ${resp.code})"
                            )
                            return@execute
                        }

                        val rawBody = resp.body?.string().orEmpty()
                        if (rawBody.isBlank()) {
                            emitReleaseError("network_error", "GitHub Release 响应内容为空")
                            return@execute
                        }

                        val json = JSONObject(rawBody)
                        val tagName = json.optString("tag_name", "").trim()
                        val version = tagName.removePrefix("v").removePrefix("V").trim()
                        val title = json.optString("name", "").trim().ifEmpty { tagName }
                        val notes = json.optString("body", "")
                        val publishedAt = json.optString("published_at", "")
                        val htmlUrl = json.optString("html_url", "")

                        var apkUrl = ""
                        var apkName = ""
                        var apkSizeBytes = 0L
                        var assetDigestSha256 = ""

                        val assets = json.optJSONArray("assets")
                        if (assets != null) {
                            for (i in 0 until assets.length()) {
                                val asset = assets.optJSONObject(i) ?: continue
                                val name = asset.optString("name", "").trim()
                                val dlUrl = asset.optString("browser_download_url", "").trim()
                                if (
                                    name.lowercase(Locale.US).endsWith(".apk") &&
                                    dlUrl.startsWith("https://", ignoreCase = true)
                                ) {
                                    apkName = name
                                    apkUrl = dlUrl
                                    apkSizeBytes = asset.optLong("size", 0L).coerceAtLeast(0L)
                                    val digestField = asset.optString("digest", "").trim()
                                    if (digestField.startsWith("sha256:", ignoreCase = true)) {
                                        val candidate = digestField.substring(7).trim()
                                        if (HEX_64_REGEX.matches(candidate)) {
                                            assetDigestSha256 = candidate.lowercase(Locale.US)
                                        }
                                    }
                                    break
                                }
                            }
                        }

                        val sha256 = assetDigestSha256.ifEmpty {
                            extractSha256FromReleaseBody(notes, apkName)
                        }

                        val result = JSONObject().apply {
                            put("ok", true)
                            put("tagName", tagName)
                            put("version", version)
                            put("title", title)
                            put("notes", notes)
                            put("publishedAt", publishedAt)
                            put("htmlUrl", htmlUrl)
                            put("apkUrl", apkUrl)
                            put("apkName", apkName)
                            put("apkSizeBytes", apkSizeBytes)
                            put("sha256", sha256)
                        }
                        onUpdateRelease(result.toString())
                    }
                } catch (e: Exception) {
                    emitReleaseError(
                        "network_error",
                        e.message?.takeIf { it.isNotBlank() } ?: "检查更新失败，请检查网络连接"
                    )
                }
            }
        } catch (_: Exception) {
            emitReleaseError("network_error", "更新检查服务不可用")
        }
    }

    fun downloadAndInstallApk(url: String, expectedSha256: String, version: String) {
        val trimmedUrl = url.trim()
        val parsedUri = runCatching { Uri.parse(trimmedUrl) }.getOrNull()
        if (
            parsedUri == null ||
            parsedUri.scheme?.lowercase(Locale.US) != "https" ||
            parsedUri.host.isNullOrBlank()
        ) {
            emitProgress("error", 0, 0L, 0L, "安装包下载必须使用安全的 HTTPS 链接")
            return
        }

        val cleanExpectedSha = expectedSha256.trim().lowercase(Locale.US)
        if (cleanExpectedSha.isNotEmpty() && !HEX_64_REGEX.matches(cleanExpectedSha)) {
            emitProgress("error", 0, 0L, 0L, "提供的 SHA-256 校验摘要格式无效")
            return
        }

        if (!isDownloading.compareAndSet(false, true)) {
            return
        }

        try {
            ioExecutor.execute {
                val safeVer = version.trim()
                    .removePrefix("v")
                    .removePrefix("V")
                    .replace(Regex("[^0-9A-Za-z._-]"), "_")
                    .ifBlank { "latest" }

                apkUpdatesDir.mkdirs()
                val partFile = File(apkUpdatesDir, "axonkey-mobile-$safeVer.apk.part")
                val finalFile = File(apkUpdatesDir, "axonkey-mobile-$safeVer.apk")

                try {
                    apkUpdatesDir.listFiles()?.forEach { existing ->
                        if (existing != partFile) {
                            runCatching { existing.delete() }
                        }
                    }
                    pendingApkFile = null

                    emitProgress("downloading", 0, 0L, 0L, "正在连接下载服务器...")
                    val actualSha = streamHttpsToFile(
                        url = trimmedUrl,
                        destFile = partFile
                    )

                    val fileLen = partFile.length()
                    emitProgress("verifying", 100, fileLen, fileLen, "正在校验安装包完整性...")

                    if (!hasZipMagic(partFile)) {
                        throw IllegalStateException("下载的安装包格式无效（非有效 APK）")
                    }

                    if (
                        cleanExpectedSha.isNotEmpty() &&
                        !actualSha.equals(cleanExpectedSha, ignoreCase = true)
                    ) {
                        throw IllegalStateException("安装包 SHA-256 完整性校验未通过")
                    }

                    if (finalFile.exists()) {
                        finalFile.delete()
                    }
                    if (!partFile.renameTo(finalFile)) {
                        throw IllegalStateException("写入安装包缓存文件失败")
                    }

                    pendingApkFile = finalFile
                    val finalLen = finalFile.length()
                    emitProgress("ready", 100, finalLen, finalLen, "安装包准备就绪")
                    installPendingApk()
                } catch (e: Throwable) {
                    runCatching { partFile.delete() }
                    emitProgress(
                        "error",
                        0,
                        0L,
                        0L,
                        e.message?.takeIf { it.isNotBlank() } ?: "下载或校验更新包失败"
                    )
                } finally {
                    isDownloading.set(false)
                }
            }
        } catch (_: Exception) {
            isDownloading.set(false)
            emitProgress("error", 0, 0L, 0L, "无法启动后台下载任务")
        }
    }

    fun installPendingApk(): Boolean {
        val apk = pendingApkFile
        if (apk == null || !apk.isFile || apk.length() <= 64L) {
            return false
        }

        val size = apk.length()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            emitProgress(
                "permission_required",
                100,
                size,
                size,
                "请授予「安装未知应用」权限后继续安装"
            )
            onRequestInstallPermission()
            return true
        }

        return try {
            emitProgress("installing", 100, size, size, "正在调起系统安装器...")
            val apkUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apk
            )
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(installIntent)
            true
        } catch (e: Exception) {
            emitProgress(
                "error",
                100,
                size,
                size,
                e.message?.takeIf { it.isNotBlank() } ?: "无法启动系统安装程序"
            )
            false
        }
    }

    fun shutdown() {
        runCatching { ioExecutor.shutdownNow() }
    }

    private fun streamHttpsToFile(url: String, destFile: File): String {
        val req = Request.Builder()
            .url(url)
            .get()
            .header("Accept", "application/octet-stream, */*")
            .header("Cache-Control", "no-cache")
            .header("User-Agent", buildUserAgent())
            .build()

        httpClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                throw IllegalStateException("下载安装包失败 (HTTP ${resp.code})")
            }
            val body = resp.body ?: throw IllegalStateException("下载响应内容为空")
            val contentLength = body.contentLength().coerceAtLeast(0L)
            if (contentLength > MAX_APK_BYTES) {
                throw IllegalStateException("安装包体积超出安全限制")
            }

            val digest = MessageDigest.getInstance("SHA-256")
            var totalRead = 0L
            var lastEmitMs = 0L

            BufferedInputStream(body.byteStream()).use { input ->
                FileOutputStream(destFile).use { output ->
                    val buffer = ByteArray(16 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        totalRead += read
                        if (totalRead > MAX_APK_BYTES) {
                            throw IllegalStateException("安装包体积超出安全限制")
                        }
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)

                        val nowMs = SystemClock.elapsedRealtime()
                        if (nowMs - lastEmitMs >= PROGRESS_THROTTLE_MS) {
                            lastEmitMs = nowMs
                            val pct = if (contentLength > 0L) {
                                ((totalRead * 100L) / contentLength).toInt().coerceIn(0, 99)
                            } else {
                                50
                            }
                            emitProgress(
                                "downloading",
                                pct,
                                totalRead,
                                contentLength,
                                "正在下载更新包..."
                            )
                        }
                    }
                    output.flush()
                }
            }

            if (totalRead <= 64L) {
                throw IllegalStateException("下载的安装包内容不完整")
            }

            val finalTotal = if (contentLength > 0L) contentLength else totalRead
            emitProgress("downloading", 100, totalRead, finalTotal, "下载完成")
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
    }

    private fun hasZipMagic(file: File): Boolean {
        if (!file.isFile || file.length() < 4L) return false
        return runCatching {
            file.inputStream().use { ins ->
                val b0 = ins.read()
                val b1 = ins.read()
                val b2 = ins.read()
                val b3 = ins.read()
                b0 == 0x50 && b1 == 0x4B && b2 == 0x03 && b3 == 0x04
            }
        }.getOrDefault(false)
    }

    private fun normalizeRepoSlug(raw: String): String? {
        val trimmed = raw.trim()
            .removePrefix("https://github.com/")
            .removePrefix("http://github.com/")
            .trim('/')
            .ifBlank { DEFAULT_REPO_SLUG }
        return if (REPO_SLUG_REGEX.matches(trimmed)) trimmed else null
    }

    private fun extractSha256FromReleaseBody(body: String, apkName: String): String {
        if (body.isBlank()) return ""

        if (apkName.isNotBlank()) {
            val escapedName = Regex.escape(apkName)
            val shaBeforeName = Regex("([a-fA-F0-9]{64})\\s+\\*?$escapedName", RegexOption.IGNORE_CASE)
            shaBeforeName.find(body)?.groupValues?.getOrNull(1)?.let {
                return it.lowercase(Locale.US)
            }
            val shaAfterName = Regex("$escapedName[^\\r\\n]*?([a-fA-F0-9]{64})", RegexOption.IGNORE_CASE)
            shaAfterName.find(body)?.groupValues?.getOrNull(1)?.let {
                return it.lowercase(Locale.US)
            }
        }

        GENERIC_SHA256_REGEX.find(body)?.groupValues?.getOrNull(1)?.let {
            return it.lowercase(Locale.US)
        }
        return ""
    }

    private fun emitReleaseError(code: String, errorMessage: String) {
        val json = JSONObject().apply {
            put("ok", false)
            put("code", code)
            put("error", errorMessage)
        }
        onUpdateRelease(json.toString())
    }

    private fun emitProgress(
        phase: String,
        percent: Int,
        downloaded: Long,
        total: Long,
        message: String
    ) {
        val json = JSONObject().apply {
            put("phase", phase)
            put("percent", percent.coerceIn(0, 100))
            put("downloaded", downloaded.coerceAtLeast(0L))
            put("total", total.coerceAtLeast(0L))
            put("message", message)
        }
        onUpdateProgress(json.toString())
    }
}
