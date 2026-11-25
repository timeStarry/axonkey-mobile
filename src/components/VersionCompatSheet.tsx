import { AlertTriangle, Download, ExternalLink, ShieldAlert } from 'lucide-react'
import { clsx } from 'clsx'
import { BottomSheet } from './BottomSheet'
import { useMobileStore } from '../state/useMobileStore'
import { openNativeExternalUrl, triggerHaptic } from '../transport/nativeBridge'

const DESKTOP_RELEASES_URL = 'https://github.com/leowzz/axonkey/releases'

export function VersionCompatSheet() {
  const notice = useMobileStore((s) => s.versionCompatNotice)
  const dismiss = useMobileStore((s) => s.dismissVersionCompatNotice)
  const setAboutSheetOpen = useMobileStore((s) => s.setAboutSheetOpen)

  if (!notice) return null

  const isHard = notice.severity === 'hard'
  const isMobileTarget = notice.target === 'mobile'

  const handleClose = () => {
    triggerHaptic('tap')
    dismiss()
  }

  const handleOpenMobileUpdater = () => {
    triggerHaptic('confirm')
    dismiss()
    setAboutSheetOpen(true)
  }

  const handleOpenDesktopReleases = () => {
    triggerHaptic('tap')
    openNativeExternalUrl(DESKTOP_RELEASES_URL)
    if (!isHard) {
      dismiss()
    }
  }

  return (
    <BottomSheet
      open={Boolean(notice)}
      onClose={handleClose}
      title={notice.title}
      closeAriaLabel="关闭版本兼容提示"
      testId="version-compat-sheet-backdrop"
    >
      <div className="space-y-3">
        <div
          className={clsx(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] border text-xs font-semibold',
            isHard
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-500',
          )}
        >
          {isHard ? (
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>
            {isHard ? '协议不兼容 · 需更新后连接' : '版本跨度较大 · 可能影响体验'}
          </span>
        </div>

        <p className="ak-text-2 text-xs leading-relaxed">{notice.message}</p>

        <div className="ak-well p-3 rounded-[16px] border space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="ak-text-2">需更新客户端</span>
            <span className="ak-text-1 font-semibold">
              {isMobileTarget ? '手机端 Axonkey Mobile' : '电脑端 Axonkey'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="ak-text-2">版本范围</span>
            <span className="ak-text-1 font-mono font-semibold">
              {notice.currentVersion ? `v${notice.currentVersion.replace(/^v/i, '')} → ` : ''}
              {notice.expectedVersion}
            </span>
          </div>
        </div>

        <div className="space-y-2 pt-0.5">
          {isMobileTarget ? (
            <button
              type="button"
              onClick={handleOpenMobileUpdater}
              className="ak-primary-solid w-full h-10 rounded-[14px] border text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isHard ? '立即检查并安装手机端更新' : '检查手机端更新'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenDesktopReleases}
              className={clsx(
                'w-full h-10 rounded-[14px] border text-xs font-semibold inline-flex items-center justify-center gap-1.5',
                isHard ? 'ak-primary-solid' : 'ak-elevated ak-text-1',
              )}
            >
              <span>查看电脑端最新版本</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="ak-elevated ak-text-2 w-full h-10 rounded-[14px] border text-xs font-medium"
          >
            {isHard ? '知道了' : '继续使用（本版本不再提示）'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
