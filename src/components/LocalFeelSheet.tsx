import { useEffect, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { BottomSheet } from './BottomSheet'
import {
  useMobileStore,
  type AirMouseFeelMode,
  type PointerTabMode,
  type ScreenOrientationMode,
  type ThemeMode,
  type VolumeKeyMouseMode,
} from '../state/useMobileStore'
import {
  getDefaultPhoneName,
  getNativeAppVersionInfo,
  triggerHaptic,
} from '../transport/nativeBridge'

export function LocalFeelSheet() {
  const open = useMobileStore((s) => s.feelSheetOpen)
  const setOpen = useMobileStore((s) => s.setFeelSheetOpen)
  const setAboutSheetOpen = useMobileStore((s) => s.setAboutSheetOpen)
  const deck = useMobileStore((s) => s.deck)
  const localFeel = useMobileStore((s) => s.localFeel)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const updateLocalFeel = useMobileStore((s) => s.updateLocalFeel)
  const setThemeMode = useMobileStore((s) => s.setThemeMode)
  const updateSensitivity = useMobileStore((s) => s.updateSensitivity)

  const isLight = effectiveTheme === 'light'
  const versionInfo = getNativeAppVersionInfo()

  const [nameDraft, setNameDraft] = useState(localFeel.deviceName)
  const [nameSaved, setNameSaved] = useState(false)

  useEffect(() => {
    setNameDraft(localFeel.deviceName)
  }, [localFeel.deviceName, open])

  const commitDeviceName = () => {
    const cleaned = nameDraft.trim().slice(0, 48) || getDefaultPhoneName()
    setNameDraft(cleaned)
    if (cleaned !== localFeel.deviceName) {
      updateLocalFeel({ deviceName: cleaned })
      triggerHaptic('confirm')
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 1200)
    }
  }

  const themeOptions: { id: ThemeMode; label: string }[] = [
    { id: 'system', label: '跟随系统' },
    { id: 'light', label: '浅色' },
    { id: 'dark', label: '深色' },
  ]

  const orientationOptions: { id: ScreenOrientationMode; label: string }[] = [
    { id: 'portrait', label: '竖屏手持' },
    { id: 'landscape', label: '横屏台架' },
    { id: 'system', label: '自动旋转' },
  ]

  const volumeKeyOptions: { id: VolumeKeyMouseMode; label: string }[] = [
    { id: 'off', label: '关闭' },
    { id: 'lr', label: '左 / 右键' },
    { id: 'rl', label: '右 / 左键' },
    { id: 'scroll', label: '滚轮' },
  ]

  const pointerTabOptions: { id: PointerTabMode; label: string }[] = [
    { id: 'trackpad', label: '触控板' },
    { id: 'airmouse', label: '飞鼠' },
  ]

  const airMouseFeelOptions: { id: AirMouseFeelMode; label: string }[] = [
    { id: 'relative', label: '惯性' },
    { id: 'laser', label: '激光' },
  ]

  const switchTrack = (checked: boolean) =>
    clsx(
      'w-10 h-6 rounded-full p-0.5 transition-colors inline-flex items-center shrink-0',
      checked
        ? isLight
          ? 'bg-[#1c1c1e] justify-end'
          : 'bg-[#30d158] justify-end'
        : isLight
          ? 'bg-black/15 justify-start'
          : 'bg-white/15 justify-start',
    )

  return (
    <BottomSheet
      open={open}
      onClose={() => setOpen(false)}
      title="偏好设置"
      closeAriaLabel="关闭"
      testId="feel-sheet-backdrop"
    >
      {/* Theme */}
      <div className="flex items-center justify-between gap-3">
        <span className="ak-text-2 text-xs font-medium shrink-0">外观</span>
        <div
          role="group"
          aria-label="外观主题切换"
          className="ak-seg grid grid-cols-3 gap-1 p-0.5 rounded-[14px] border w-[204px]"
        >
          {themeOptions.map((opt) => {
            const active = localFeel.themeMode === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  setThemeMode(opt.id)
                }}
                className={clsx(
                  'h-7 rounded-[11px] text-xs font-medium transition-colors',
                  active ? 'ak-elevated-alt border' : 'ak-text-2',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Screen Orientation */}
      <div className="flex items-center justify-between gap-3">
        <span className="ak-text-2 text-xs font-medium shrink-0">画面方向</span>
        <div
          role="group"
          aria-label="画面方向切换"
          className="ak-seg grid grid-cols-3 gap-1 p-0.5 rounded-[14px] border w-[204px]"
        >
          {orientationOptions.map((opt) => {
            const active = localFeel.screenOrientation === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  updateLocalFeel({ screenOrientation: opt.id })
                }}
                className={clsx(
                  'h-7 rounded-[11px] text-xs font-medium transition-colors',
                  active ? 'ak-elevated-alt border' : 'ak-text-2',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Device Name */}
      <div className="flex items-center justify-between gap-3">
        <span className="ak-text-2 text-xs font-medium shrink-0">
          本机名称{nameSaved ? ' · 已存' : ''}
        </span>
        <div className="flex items-center gap-1.5 w-[204px]">
          <input
            type="text"
            value={nameDraft}
            maxLength={48}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitDeviceName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            placeholder={getDefaultPhoneName()}
            className="ak-input flex-1 min-w-0 h-8 px-2.5 rounded-[12px] border text-xs focus:outline-none"
          />
          {nameDraft.trim() !== localFeel.deviceName && (
            <button
              type="button"
              onClick={commitDeviceName}
              aria-label="保存名称"
              className="ak-primary-solid h-8 w-8 rounded-[12px] border inline-flex items-center justify-center shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Sensitivity Sliders */}
      <div className="ak-well p-3 rounded-[18px] border space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-2">指针速度</span>
            <span className="ak-text-1 font-mono">{deck.pointerSensitivity.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min={0.4}
            max={3.0}
            step={0.1}
            value={deck.pointerSensitivity}
            onChange={(e) =>
              updateSensitivity({ pointerSensitivity: Number.parseFloat(e.target.value) })
            }
            className="ak-slider w-full"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-2">滚轮速度</span>
            <span className="ak-text-1 font-mono">{deck.scrollSensitivity.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min={0.4}
            max={3.0}
            step={0.1}
            value={deck.scrollSensitivity}
            onChange={(e) =>
              updateSensitivity({ scrollSensitivity: Number.parseFloat(e.target.value) })
            }
            className="ak-slider w-full"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-2">飞鼠速度</span>
            <span className="ak-text-1 font-mono">{localFeel.gyroSensitivity.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min={0.4}
            max={3.0}
            step={0.1}
            value={localFeel.gyroSensitivity}
            onChange={(e) =>
              updateLocalFeel({ gyroSensitivity: Number.parseFloat(e.target.value) })
            }
            className="ak-slider w-full"
          />
        </div>
      </div>

      {/* Air-Mouse Volume Keys */}
      <div className="space-y-1.5">
        <span className="ak-text-2 text-xs font-medium block">飞鼠音量键</span>
        <div
          role="group"
          aria-label="飞鼠实体音量键模式"
          className="ak-seg grid grid-cols-4 gap-1 p-0.5 rounded-[14px] border"
        >
          {volumeKeyOptions.map((opt) => {
            const active = localFeel.volumeKeyMouseMode === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  updateLocalFeel({ volumeKeyMouseMode: opt.id })
                }}
                className={clsx(
                  'h-7 rounded-[11px] text-xs font-medium transition-colors',
                  active ? 'ak-elevated-alt border' : 'ak-text-2',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Default Pointer & Air-Mouse Mode */}
      <div className="grid grid-cols-2 gap-2">
        <div className="ak-seg grid grid-cols-2 gap-1 p-0.5 rounded-[14px] border">
          {pointerTabOptions.map((opt) => {
            const active = localFeel.preferredPointerTab === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  updateLocalFeel({ preferredPointerTab: opt.id })
                }}
                className={clsx(
                  'h-7 rounded-[11px] text-xs font-medium transition-colors',
                  active ? 'ak-elevated-alt border' : 'ak-text-2',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="ak-seg grid grid-cols-2 gap-1 p-0.5 rounded-[14px] border">
          {airMouseFeelOptions.map((opt) => {
            const active = localFeel.airMouseFeel === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  updateLocalFeel({ airMouseFeel: opt.id })
                }}
                className={clsx(
                  'h-7 rounded-[11px] text-xs font-medium transition-colors',
                  active ? 'ak-elevated-alt border' : 'ak-text-2',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Crisp Single-Line Switches */}
      <div className="ak-well rounded-[18px] border divide-y divide-black/[0.04] dark:divide-white/[0.05]">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            updateLocalFeel({
              threeFingerSystemGestures: !localFeel.threeFingerSystemGestures,
            })
          }}
          className="w-full h-11 px-3.5 flex items-center justify-between text-xs"
        >
          <span className="ak-text-1 font-medium">三指系统手势</span>
          <span className={switchTrack(localFeel.threeFingerSystemGestures)}>
            <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            const next = !localFeel.hapticsEnabled
            updateLocalFeel({ hapticsEnabled: next })
            if (next) triggerHaptic('confirm')
          }}
          className="w-full h-11 px-3.5 flex items-center justify-between text-xs"
        >
          <span className="ak-text-1 font-medium">触觉振动</span>
          <span className={switchTrack(localFeel.hapticsEnabled)}>
            <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            updateLocalFeel({ keepScreenOn: !localFeel.keepScreenOn })
          }}
          className="w-full h-11 px-3.5 flex items-center justify-between text-xs"
        >
          <span className="ak-text-1 font-medium">连接时屏幕常亮</span>
          <span className={switchTrack(localFeel.keepScreenOn)}>
            <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
          </span>
        </button>
      </div>

      {/* Crisp Single-Line About & Update Row */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('tap')
          setOpen(false)
          setAboutSheetOpen(true)
        }}
        aria-label="关于与版本更新"
        className="ak-well w-full h-11 px-3.5 rounded-[18px] border flex items-center justify-between text-xs"
      >
        <span className="ak-text-1 font-medium">版本更新</span>
        <span className="ak-text-2 font-mono inline-flex items-center gap-1">
          <span>v{versionInfo.versionName}</span>
          <ChevronRight className="w-3.5 h-3.5 ak-text-3" />
        </span>
      </button>
    </BottomSheet>
  )
}
