import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Laptop,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useMobileStore } from '../state/useMobileStore'
import {
  checkNativeGithubRelease,
  compareSemver,
  downloadAndInstallNativeApk,
  getNativeAppVersionInfo,
  installDownloadedNativeApk,
  openNativeExternalUrl,
  triggerHaptic,
  type ApkUpdateProgressEvent,
  type GithubReleaseCheckResult,
} from '../transport/nativeBridge'

const MOBILE_REPO_SLUG = 'timeStarry/axonkey-mobile'
const DESKTOP_REPO_URL = 'https://github.com/leowzz/axonkey'
const MOBILE_REPO_URL = 'https://github.com/timeStarry/axonkey-mobile'

function formatMegabytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 MB'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up_to_date'; message: string }
  | { kind: 'no_release'; message: string }
  | {
      kind: 'update_available'
      release: Extract<GithubReleaseCheckResult, { ok: true }>
    }
  | { kind: 'error'; message: string }

export function AboutUpdateSheet() {
  const open = useMobileStore((s) => s.aboutSheetOpen)
  const setOpen = useMobileStore((s) => s.setAboutSheetOpen)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)

  const isLight = effectiveTheme === 'light'
  const versionInfo = getNativeAppVersionInfo()

  const [checkState, setCheckState] = useState<CheckState>({ kind: 'idle' })
  const [progress, setProgress] = useState<ApkUpdateProgressEvent | null>(null)

  useEffect(() => {
    if (!open || typeof window === 'undefined') return

    const handleReleaseResult = (parsed: GithubReleaseCheckResult) => {
      if (!parsed.ok) {
        if (parsed.code === 'no_release') {
          setCheckState({
            kind: 'no_release',
            message: '当前版本已是最新（仓库暂未发布新 Release）',
          })
        } else {
          setCheckState({
            kind: 'error',
            message: parsed.error || '检查更新失败，请检查网络连接',
          })
        }
        return
      }

      const latestVer = parsed.version || parsed.tagName.replace(/^v/i, '')
      if (compareSemver(versionInfo.versionName, latestVer) < 0) {
        triggerHaptic('confirm')
        setCheckState({
          kind: 'update_available',
          release: {
            ...parsed,
            version: latestVer,
          },
        })
      } else {
        setCheckState({
          kind: 'up_to_date',
          message: `当前版本已是最新 (v${versionInfo.versionName})`,
        })
      }
    }

    window.__axonkeyNativeOnUpdateRelease = (rawJson: string) => {
      try {
        const parsed = JSON.parse(rawJson) as GithubReleaseCheckResult
        handleReleaseResult(parsed)
      } catch {
        setCheckState({ kind: 'error', message: '解析版本信息失败' })
      }
    }

    window.__axonkeyNativeOnUpdateProgress = (rawJson: string) => {
      try {
        const evt = JSON.parse(rawJson) as ApkUpdateProgressEvent
        setProgress(evt)
        if (evt.phase === 'ready' || evt.phase === 'installing') {
          triggerHaptic('confirm')
        } else if (evt.phase === 'error') {
          triggerHaptic('error')
        }
      } catch {
        // Ignore malformed progress json
      }
    }

    return () => {
      delete window.__axonkeyNativeOnUpdateRelease
      delete window.__axonkeyNativeOnUpdateProgress
    }
  }, [open, versionInfo.versionName])

  if (!open) return null

  const runCheckUpdate = async () => {
    triggerHaptic('tap')
    setProgress(null)
    setCheckState({ kind: 'checking' })

    const handledByNative = checkNativeGithubRelease(MOBILE_REPO_SLUG)
    if (handledByNative) return

    // Browser / Dev fallback using GitHub Releases REST API
    try {
      const resp = await fetch(`https://api.github.com/repos/${MOBILE_REPO_SLUG}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (resp.status === 404) {
        setCheckState({
          kind: 'no_release',
          message: '当前版本已是最新（仓库暂未发布新 Release）',
        })
        return
      }
      if (!resp.ok) {
        setCheckState({
          kind: 'error',
          message: `GitHub 接口返回异常 (HTTP ${resp.status})`,
        })
        return
      }
      const data = (await resp.json()) as {
        tag_name?: string
        name?: string
        body?: string
        published_at?: string
        html_url?: string
        assets?: Array<{
          name?: string
          browser_download_url?: string
          size?: number
        }>
      }
      const tagName = data.tag_name ?? ''
      const version = tagName.replace(/^v/i, '')
      const apkAsset = data.assets?.find((a) => a.name?.toLowerCase().endsWith('.apk'))

      if (!version || compareSemver(versionInfo.versionName, version) >= 0) {
        setCheckState({
          kind: 'up_to_date',
          message: `当前版本已是最新 (v${versionInfo.versionName})`,
        })
        return
      }

      setCheckState({
        kind: 'update_available',
        release: {
          ok: true,
          tagName: tagName || `v${version}`,
          version,
          title: data.name || `Axonkey Mobile v${version}`,
          notes: data.body || '包含体验优化与问题修复。',
          publishedAt: data.published_at || '',
          htmlUrl: data.html_url || MOBILE_REPO_URL,
          apkUrl: apkAsset?.browser_download_url || '',
          apkName: apkAsset?.name || `axonkey-mobile-${version}.apk`,
          apkSizeBytes: apkAsset?.size ?? 0,
          sha256: '',
        },
      })
    } catch {
      setCheckState({
        kind: 'error',
        message: '检查更新失败，请检查网络连接后重试',
      })
    }
  }

  const handleStartDownload = (release: Extract<GithubReleaseCheckResult, { ok: true }>) => {
    triggerHaptic('confirm')
    if (!release.apkUrl) {
      openNativeExternalUrl(release.htmlUrl || MOBILE_REPO_URL)
      return
    }
    const startedNative = downloadAndInstallNativeApk(
      release.apkUrl,
      release.sha256 || '',
      release.version,
    )
    if (!startedNative) {
      openNativeExternalUrl(release.apkUrl)
    }
  }

  const handleResumeInstall = () => {
    triggerHaptic('confirm')
    installDownloadedNativeApk()
  }

  return (
    <div className="ak-backdrop fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm">
      <div className="ak-sheet w-full max-w-md rounded-t-3xl border-t p-5 safe-bottom space-y-4 max-h-[88vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className={clsx('w-4 h-4', isLight ? 'text-blue-600' : 'text-blue-400')} />
            <h2 className="ak-text-1 text-base font-semibold">关于与版本更新</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭关于面板"
            className="ak-pill ak-text-2 w-8 h-8 rounded-full border inline-flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* App Identity & Check Update Card */}
        <div className="ak-well p-4 rounded-2xl border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={clsx(
                  'w-11 h-11 rounded-2xl border inline-flex items-center justify-center shrink-0',
                  isLight
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-blue-500/20 border-blue-400/40 text-blue-200',
                )}
              >
                <Smartphone className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="ak-text-1 text-sm font-bold truncate">Axonkey Mobile</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="ak-code-chip ak-text-2 px-2 py-0.5 rounded-md border text-[11px] font-mono font-semibold">
                    v{versionInfo.versionName}
                  </span>
                  <span className="ak-text-3 text-[11px]">Build {versionInfo.versionCode}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={checkState.kind === 'checking' || progress?.phase === 'downloading'}
              onClick={runCheckUpdate}
              className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0 transition-all active:scale-95"
            >
              <RefreshCw
                className={clsx('w-3.5 h-3.5', checkState.kind === 'checking' && 'animate-spin')}
              />
              <span>{checkState.kind === 'checking' ? '正在检查…' : '检查更新'}</span>
            </button>
          </div>

          {/* Status Feedback Banner */}
          {(checkState.kind === 'up_to_date' || checkState.kind === 'no_release') && (
            <div
              className={clsx(
                'px-3 py-2 rounded-xl border flex items-center gap-2 text-xs',
                isLight
                  ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-800'
                  : 'bg-emerald-500/12 border-emerald-400/30 text-emerald-200',
              )}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{checkState.message}</span>
            </div>
          )}

          {checkState.kind === 'error' && (
            <div
              className={clsx(
                'px-3 py-2 rounded-xl border flex items-center gap-2 text-xs',
                isLight
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-800'
                  : 'bg-rose-500/15 border-rose-400/30 text-rose-200',
              )}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{checkState.message}</span>
            </div>
          )}

          {/* New Release Card + Live APK Downloader */}
          {checkState.kind === 'update_available' && (
            <div
              className={clsx(
                'p-3.5 rounded-2xl border space-y-2.5',
                isLight
                  ? 'bg-blue-600/[0.06] border-blue-500/30'
                  : 'bg-blue-500/10 border-blue-400/30',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="ak-text-1 text-xs font-bold truncate">
                  发现新版本：{checkState.release.title || checkState.release.tagName}
                </div>
                {checkState.release.apkSizeBytes > 0 && (
                  <span className="ak-code-chip ak-text-2 px-2 py-0.5 rounded border text-[10.5px] font-mono shrink-0">
                    {formatMegabytes(checkState.release.apkSizeBytes)}
                  </span>
                )}
              </div>

              {checkState.release.notes && (
                <div className="ak-elevated ak-text-2 p-2.5 rounded-xl border text-[11.5px] leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {checkState.release.notes}
                </div>
              )}

              {/* Download / Verify / Permission Progress UI */}
              {progress ? (
                <div className="space-y-2 pt-0.5">
                  {(progress.phase === 'downloading' || progress.phase === 'verifying') && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="ak-text-1 font-semibold">
                          {progress.phase === 'verifying'
                            ? '正在校验安装包完整性…'
                            : `正在下载更新 ${Math.round(progress.percent)}%`}
                        </span>
                        {progress.total > 0 && (
                          <span className="ak-text-2">
                            {formatMegabytes(progress.downloaded)} /{' '}
                            {formatMegabytes(progress.total)}
                          </span>
                        )}
                      </div>
                      <div className="ak-seg h-2 w-full rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-150"
                          style={{
                            width: `${Math.min(100, Math.max(4, progress.percent || 0))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {progress.phase === 'permission_required' && (
                    <div
                      className={clsx(
                        'p-2.5 rounded-xl border space-y-2 text-xs',
                        isLight
                          ? 'bg-amber-500/12 border-amber-500/35 text-amber-900'
                          : 'bg-amber-500/15 border-amber-400/35 text-amber-100',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          {progress.message || '请允许本应用安装未知来源更新包，开启后可立即继续安装。'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleResumeInstall}
                        className="w-full h-9 rounded-xl bg-blue-600 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>继续安装</span>
                      </button>
                    </div>
                  )}

                  {(progress.phase === 'ready' || progress.phase === 'installing') && (
                    <button
                      type="button"
                      onClick={handleResumeInstall}
                      className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {progress.phase === 'installing' ? '正在拉起安装器…' : '立即安装更新'}
                      </span>
                    </button>
                  )}

                  {progress.phase === 'error' && (
                    <div className="space-y-2">
                      <div className="text-xs text-rose-500">
                        {progress.message || '下载安装包失败，请重试'}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartDownload(checkState.release)}
                        className="w-full h-9 rounded-xl bg-blue-600 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>重新下载并安装</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStartDownload(checkState.release)}
                  className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20 active:scale-[0.98] transition-transform"
                >
                  <Download className="w-4 h-4" />
                  <span>立即安装更新</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Dual GitHub Repository Jump Cards */}
        <div className="space-y-2">
          <div className="ak-text-2 text-xs font-semibold">开源项目仓库</div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              openNativeExternalUrl(DESKTOP_REPO_URL)
            }}
            className="tile-surface ak-well w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={clsx(
                  'w-9 h-9 rounded-xl border inline-flex items-center justify-center shrink-0',
                  isLight
                    ? 'bg-slate-900/[0.06] border-slate-900/10 text-slate-700'
                    : 'bg-white/[0.07] border-white/10 text-zinc-200',
                )}
              >
                <Laptop className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="ak-text-1 text-xs font-bold truncate">Axonkey 桌面端源仓库</div>
                <div className="ak-text-2 text-[11px] font-mono truncate mt-0.5">
                  github.com/leowzz/axonkey
                </div>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 ak-text-3 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              openNativeExternalUrl(MOBILE_REPO_URL)
            }}
            className="tile-surface ak-well w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={clsx(
                  'w-9 h-9 rounded-xl border inline-flex items-center justify-center shrink-0',
                  isLight
                    ? 'bg-blue-600/10 border-blue-500/25 text-blue-700'
                    : 'bg-blue-500/15 border-blue-400/25 text-blue-300',
                )}
              >
                <Smartphone className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="ak-text-1 text-xs font-bold truncate">Axonkey Mobile 仓库</div>
                <div className="ak-text-2 text-[11px] font-mono truncate mt-0.5">
                  github.com/timeStarry/axonkey-mobile
                </div>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 ak-text-3 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  )
}
