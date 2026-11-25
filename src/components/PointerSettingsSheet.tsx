import { RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import { BottomSheet } from './BottomSheet'
import {
  useMobileStore,
  type AirMouseFeelMode,
  type PointerTabMode,
  type VolumeKeyMouseMode,
} from '../state/useMobileStore'
import { DEFAULT_MOBILE_DECK } from '../transport/defaultDeck'
import { DEFAULT_LOCAL_FEEL, triggerHaptic } from '../transport/nativeBridge'

export function PointerSettingsSheet() {
  const open = useMobileStore((s) => s.pointerSettingsOpen)
  const setOpen = useMobileStore((s) => s.setPointerSettingsOpen)
  const deck = useMobileStore((s) => s.deck)
  const localFeel = useMobileStore((s) => s.localFeel)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const updateLocalFeel = useMobileStore((s) => s.updateLocalFeel)
  const updateSensitivity = useMobileStore((s) => s.updateSensitivity)
  const resetPointerSettings = useMobileStore((s) => s.resetPointerSettings)
  const showHudToast = useMobileStore((s) => s.showHudToast)

  const isLight = effectiveTheme === 'light'

  const isAtDefault =
    Math.abs(deck.pointerSensitivity - DEFAULT_MOBILE_DECK.pointerSensitivity) < 0.01 &&
    Math.abs(deck.scrollSensitivity - DEFAULT_MOBILE_DECK.scrollSensitivity) < 0.01 &&
    Math.abs(localFeel.gyroSensitivity - DEFAULT_LOCAL_FEEL.gyroSensitivity) < 0.01 &&
    localFeel.volumeKeyMouseMode === DEFAULT_LOCAL_FEEL.volumeKeyMouseMode &&
    localFeel.preferredPointerTab === DEFAULT_LOCAL_FEEL.preferredPointerTab &&
    localFeel.airMouseFeel === DEFAULT_LOCAL_FEEL.airMouseFeel &&
    localFeel.airMouseHandedness === DEFAULT_LOCAL_FEEL.airMouseHandedness &&
    localFeel.threeFingerSystemGestures === DEFAULT_LOCAL_FEEL.threeFingerSystemGestures

  const handleResetDefaults = () => {
    if (isAtDefault) return
    triggerHaptic('confirm')
    resetPointerSettings()
    showHudToast('指针与飞鼠设置已恢复默认')
  }

  const volumeKeyOptions: { id: VolumeKeyMouseMode; label: string; tip: string }[] = [
    { id: 'off', label: '关闭', tip: '已关闭飞鼠实体音量键接管' },
    { id: 'lr', label: '左 / 右键', tip: '飞鼠音量键：音量+ 左键 · 音量- 右键' },
    { id: 'rl', label: '右 / 左键', tip: '飞鼠音量键：音量+ 右键 · 音量- 左键' },
    { id: 'scroll', label: '滚轮', tip: '飞鼠音量键已映射为上下滚轮' },
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
      title="指针与飞鼠设置"
      closeAriaLabel="关闭指针设置"
      testId="pointer-settings-sheet-backdrop"
      headerRight={
        <button
          type="button"
          disabled={isAtDefault}
          onClick={handleResetDefaults}
          aria-label="恢复默认指针设置"
          className={clsx(
            'h-7 px-2.5 rounded-full border text-[11px] font-medium inline-flex items-center gap-1 transition-opacity',
            isAtDefault
              ? 'ak-pill ak-text-3 opacity-45 cursor-default'
              : 'ak-elevated ak-text-1 active:scale-95',
          )}
        >
          <RotateCcw className="w-3 h-3" />
          <span>恢复默认</span>
        </button>
      }
    >
      {/* Sensitivity Sliders */}
      <div className="ak-well p-3 rounded-[18px] border space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-2">触控板速度</span>
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
            <span className="ak-text-2">飞鼠灵敏度</span>
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

      {/* Air-Mouse Hardware Volume Keys */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="ak-text-2 text-xs font-medium">飞鼠实体音量键</span>
          <span className="ak-text-3 text-[11px]">仅在飞鼠画面生效</span>
        </div>
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
                  showHudToast(opt.tip)
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

      {/* Default Sub-Tab & Air-Mouse Mode */}
      <div className="space-y-1.5">
        <span className="ak-text-2 text-xs font-medium block">默认子模式</span>
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
      </div>

      {/* Three-Finger System Gestures Switch */}
      <div className="ak-well rounded-[18px] border">
        <button
          type="button"
          onClick={() => {
            const next = !localFeel.threeFingerSystemGestures
            triggerHaptic('tap')
            updateLocalFeel({ threeFingerSystemGestures: next })
            showHudToast(next ? '已开启触控板三指系统手势' : '已关闭触控板三指系统手势')
          }}
          className="w-full h-11 px-3.5 flex items-center justify-between text-xs"
        >
          <span className="ak-text-1 font-medium">三指系统手势</span>
          <span className={switchTrack(localFeel.threeFingerSystemGestures)}>
            <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
          </span>
        </button>
      </div>
    </BottomSheet>
  )
}
