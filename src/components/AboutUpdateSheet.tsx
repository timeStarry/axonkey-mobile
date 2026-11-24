import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { clsx } from 'clsx'
import { BottomSheet } from './BottomSheet'
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

  const runCheckUpdate = async () => {
    triggerHaptic('tap')
    setProgress(null)
    setCheckState({ kind: 'checking' })

    const handledByNative = checkNativeGithubRelease(MOBILE_REPO_SLUG)
    if (handledByNative) return

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
          notes: data.body || '',
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
        message: '检查更新失败，请稍后重试',
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
    <BottomSheet
      open={open}
      onClose={() => setOpen(false)}
      title="关于与版本更新"
      closeAriaLabel="关闭关于面板"
      testId="about-sheet-backdrop"
    >
      {/* Version Identity & Check Update */}
      <div className="ak-well p-3.5 rounded-[18px] border space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="ak-text-1 text-sm font-semibold truncate">Axonkey Mobile</div>
            <div className="ak-text-2 text-xs font-mono mt-0.5">v{versionInfo.versionName}</div>
          </div>

          <button
            type="button"
            disabled={checkState.kind === 'checking' || progress?.phase === 'downloading'}
            onClick={runCheckUpdate}
            className="ak-primary-solid h-9 px-3.5 rounded-[14px] border disabled:opacity-50 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw
              className={clsx('w-3.5 h-3.5', checkState.kind === 'checking' && 'animate-spin')}
            />
            <span>{checkState.kind === 'checking' ? '正在检查…' : '检查更新'}</span>
          </button>
        </div>

        {(checkState.kind === 'up_to_date' || checkState.kind === 'no_release') && (
          <div className="ak-elevated px-3 py-2 rounded-[14px] border flex items-center gap-2 text-xs ak-text-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#30d158]" />
            <span>{checkState.message}</span>
          </div>
        )}

        {checkState.kind === 'error' && (
          <div className="px-3 py-2 rounded-[14px] border border-rose-500/30 flex items-center gap-2 text-xs text-rose-500">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{checkState.message}</span>
          </div>
        )}

        {checkState.kind === 'update_available' && (
          <div className="ak-elevated p-3 rounded-[16px] border space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="ak-text-1 text-xs font-semibold truncate">
                发现新版本：{checkState.release.title || checkState.release.tagName}
              </div>
              {checkState.release.apkSizeBytes > 0 && (
                <span className="ak-text-2 text-[11px] font-mono shrink-0">
                  {formatMegabytes(checkState.release.apkSizeBytes)}
                </span>
              )}
            </div>

            {checkState.release.notes && (
              <div className="ak-well ak-text-2 p-2.5 rounded-[12px] border text-[11.5px] leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                {checkState.release.notes}
              </div>
            )}

            {progress ? (
              <div className="space-y-2">
                {(progress.phase === 'downloading' || progress.phase === 'verifying') && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="ak-text-1">
                        {progress.phase === 'verifying'
                          ? '正在校验安装包…'
                          : `正在下载更新 ${Math.round(progress.percent)}%`}
                      </span>
                      {progress.total > 0 && (
                        <span className="ak-text-2">
                          {formatMegabytes(progress.downloaded)} / {formatMegabytes(progress.total)}
                        </span>
                      )}
                    </div>
                    <div className="ak-seg h-1.5 w-full rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full transition-all duration-150', isLight ? 'bg-[#1c1c1e]' : 'bg-[#f2f2f7]')}
                        style={{
                          width: `${Math.min(100, Math.max(4, progress.percent || 0))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {progress.phase === 'permission_required' && (
                  <div className="p-2.5 rounded-[12px] border border-amber-500/30 space-y-2 text-xs">
                    <div className="flex items-start gap-2 ak-text-1">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                      <span>{progress.message || '请允许安装未知来源更新包'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleResumeInstall}
                      className="ak-primary-solid w-full h-9 rounded-[12px] border font-semibold text-xs inline-flex items-center justify-center gap-1.5"
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
                    className="ak-primary-solid w-full h-9 rounded-[12px] border font-semibold text-xs inline-flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
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
                      className="ak-primary-solid w-full h-9 rounded-[12px] border font-semibold text-xs inline-flex items-center justify-center gap-1.5"
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
                className="ak-primary-solid w-full h-9 rounded-[12px] border font-semibold text-xs inline-flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>立即安装更新</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Crisp Single-Line Open-Source Repo Links */}
      <div className="ak-well rounded-[18px] border divide-y divide-black/[0.04] dark:divide-white/[0.05]">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            openNativeExternalUrl(DESKTOP_REPO_URL)
          }}
          className="w-full h-11 px-3.5 flex items-center justify-between text-xs text-left"
        >
          <span className="ak-text-1 font-medium">Axonkey 桌面端源仓库</span>
          <ExternalLink className="w-3.5 h-3.5 ak-text-3 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            openNativeExternalUrl(MOBILE_REPO_URL)
          }}
          className="w-full h-11 px-3.5 flex items-center justify-between text-xs text-left"
        >
          <span className="ak-text-1 font-medium">Axonkey Mobile 仓库</span>
          <ExternalLink className="w-3.5 h-3.5 ak-text-3 shrink-0" />
        </button>
      </div>
    </BottomSheet>
  )
}
