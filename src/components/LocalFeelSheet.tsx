import { useEffect, useState } from 'react'
import {
  Check,
  ChevronRight,
  Hand,
  Info,
  Monitor,
  MonitorSmartphone,
  Moon,
  RotateCw,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  Vibrate,
  Volume2,
  Wand2,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
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
  const setPresetWizardOpen = useMobileStore((s) => s.setPresetWizardOpen)
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

  if (!open) return null

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

  const themeOptions: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
    { id: 'system', label: '跟随系统', icon: MonitorSmartphone },
    { id: 'light', label: '浅色模式', icon: Sun },
    { id: 'dark', label: '深色模式', icon: Moon },
  ]

  const orientationOptions: { id: ScreenOrientationMode; label: string }[] = [
    { id: 'portrait', label: '竖屏手持' },
    { id: 'landscape', label: '横屏台架' },
    { id: 'system', label: '自动旋转' },
  ]

  const volumeKeyOptions: { id: VolumeKeyMouseMode; label: string }[] = [
    { id: 'off', label: '关闭' },
    { id: 'lr', label: '音量+左/音量-右' },
    { id: 'rl', label: '音量+右/音量-左' },
    { id: 'scroll', label: '滚轮翻页' },
  ]

  const pointerTabOptions: { id: PointerTabMode; label: string }[] = [
    { id: 'trackpad', label: '触控板优先' },
    { id: 'airmouse', label: '体感飞鼠优先' },
  ]

  const airMouseFeelOptions: { id: AirMouseFeelMode; label: string }[] = [
    { id: 'relative', label: '惯性离合（零漂移）' },
    { id: 'laser', label: '激光指哪（射线映射）' },
  ]

  return (
    <div className="ak-backdrop fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm">
      <div className="ak-sheet w-full max-w-md rounded-t-3xl border-t p-5 safe-bottom space-y-4 max-h-[88vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal
              className={clsx('w-4 h-4', isLight ? 'text-blue-600' : 'text-blue-400')}
            />
            <h2 className="ak-text-1 text-base font-semibold">本地外观与操控手感</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ak-pill ak-text-2 w-8 h-8 rounded-full border inline-flex items-center justify-center"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Starter Preset Wizard Entry */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setOpen(false)
            setPresetWizardOpen(true)
          }}
          className={clsx(
            'tile-surface w-full px-3.5 py-3 rounded-2xl border flex items-center justify-between gap-2 text-left',
            isLight
              ? 'bg-blue-600/[0.06] border-blue-500/30'
              : 'bg-blue-500/12 border-blue-400/30',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={clsx(
                'w-8 h-8 rounded-xl inline-flex items-center justify-center shrink-0',
                isLight ? 'bg-blue-600 text-white' : 'bg-blue-500/25 text-blue-200',
              )}
            >
              <Wand2 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="ak-text-1 text-xs font-bold">预设方案与开箱向导</div>
              <div className="ak-text-2 text-[11px] truncate">
                切换日常遥控、AI 编程副屏、演示影音或纯净空白面板
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 ak-text-3 shrink-0" />
        </button>

        {/* Theme Switcher: System | Light | Dark */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-2 font-medium">外观主题</span>
            <span className="ak-text-3 text-[11px]">
              当前生效：{isLight ? '浅色陶瓷' : '深色暗曜'}
            </span>
          </div>
          <div
            role="group"
            aria-label="外观主题切换"
            className="ak-seg grid grid-cols-3 gap-1.5 p-1 rounded-2xl border"
          >
            {themeOptions.map((opt) => {
              const Icon = opt.icon
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
                    'h-9 rounded-xl inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-all',
                    active ? 'bg-blue-600 text-white shadow-xs' : 'ak-text-2',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Screen Orientation Switcher: Portrait | Landscape | System */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-2 inline-flex items-center gap-1.5 font-medium">
              <RotateCw className="w-3.5 h-3.5" />
              <span>画面方向</span>
            </span>
            <span className="ak-text-3 text-[11px]">横屏自动启用双栏台架工作台</span>
          </div>
          <div
            role="group"
            aria-label="画面方向切换"
            className="ak-seg grid grid-cols-3 gap-1.5 p-1 rounded-2xl border"
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
                    'h-9 rounded-xl inline-flex items-center justify-center text-xs font-semibold transition-all',
                    active ? 'bg-blue-600 text-white shadow-xs' : 'ak-text-2',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Device Remark Name */}
        <div className="ak-well p-3.5 rounded-2xl border space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-1 inline-flex items-center gap-1.5 font-medium">
              <Smartphone
                className={clsx('w-3.5 h-3.5', isLight ? 'text-blue-600' : 'text-blue-400')}
              />
              <span>本机备注名称</span>
            </span>
            {nameSaved && (
              <span
                className={clsx(
                  'inline-flex items-center gap-0.5 text-[11px] font-medium',
                  isLight ? 'text-emerald-700' : 'text-emerald-300',
                )}
              >
                <Check className="w-3 h-3" />
                已更新
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameDraft}
              maxLength={48}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitDeviceName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              placeholder={getDefaultPhoneName()}
              className="ak-input flex-1 h-10 px-3 rounded-xl border text-sm focus:outline-none focus:border-blue-500"
            />
            {nameDraft.trim() !== localFeel.deviceName && (
              <button
                type="button"
                onClick={commitDeviceName}
                className="h-10 px-3.5 rounded-xl bg-blue-600 text-xs font-semibold text-white shrink-0"
              >
                保存
              </button>
            )}
          </div>
        </div>

        {/* Sliders Group */}
        <div className="ak-well space-y-3.5 p-3.5 rounded-2xl border">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="ak-text-1 font-medium">触控板指针灵敏度</span>
              <span
                className={clsx(
                  'font-mono font-semibold',
                  isLight ? 'text-blue-600' : 'text-blue-300',
                )}
              >
                {deck.pointerSensitivity.toFixed(1)}×
              </span>
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="ak-text-1 font-medium">双指滚轮灵敏度</span>
              <span
                className={clsx(
                  'font-mono font-semibold',
                  isLight ? 'text-blue-600' : 'text-blue-300',
                )}
              >
                {deck.scrollSensitivity.toFixed(1)}×
              </span>
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="ak-text-1 font-medium">体感飞鼠灵敏度</span>
              <span
                className={clsx(
                  'font-mono font-semibold',
                  isLight ? 'text-blue-600' : 'text-blue-300',
                )}
              >
                {localFeel.gyroSensitivity.toFixed(1)}×
              </span>
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

        {/* Hardware Volume Key Mouse Takeover in Air-Mouse */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-2 inline-flex items-center gap-1.5 font-medium">
              <Volume2 className="w-3.5 h-3.5" />
              <span>飞鼠实体音量键</span>
            </span>
            <span className="ak-text-3 text-[11px]">仅在体感飞鼠前台激活时接管</span>
          </div>
          <div
            role="group"
            aria-label="飞鼠实体音量键模式"
            className="ak-seg grid grid-cols-2 gap-1.5 p-1 rounded-2xl border"
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
                    'h-8 rounded-xl text-xs font-semibold transition-colors',
                    active ? 'bg-blue-600 text-white' : 'ak-text-2',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Default Pointer Modality & Air-Mouse Feel */}
        <div className="space-y-2">
          <div className="ak-text-2 text-xs font-medium">指针默认入口与飞鼠模式</div>
          <div className="ak-seg grid grid-cols-2 gap-1.5 p-1 rounded-2xl border">
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
                    'h-8 rounded-xl text-xs font-semibold transition-colors',
                    active ? 'bg-blue-600 text-white' : 'ak-text-2',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <div className="ak-seg grid grid-cols-2 gap-1.5 p-1 rounded-2xl border">
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
                    'h-8 rounded-xl text-xs font-semibold transition-colors',
                    active ? 'bg-blue-600 text-white' : 'ak-text-2',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Toggles: 3-Finger System Gestures, Haptics & Keep Screen On */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              updateLocalFeel({
                threeFingerSystemGestures: !localFeel.threeFingerSystemGestures,
              })
            }}
            className="ak-well w-full px-3.5 py-3 rounded-2xl border flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Hand className="w-4 h-4 ak-text-2" />
              <div className="text-left">
                <div className="ak-text-1 text-xs font-semibold">三指系统手势</div>
                <div className="ak-text-2 text-[11px]">
                  触控板三指上滑任务视图、下滑桌面、左右切虚拟桌面、轻点中键
                </div>
              </div>
            </div>
            <span
              className={clsx(
                'w-10 h-6 rounded-full p-0.5 transition-colors inline-flex items-center shrink-0',
                localFeel.threeFingerSystemGestures
                  ? 'bg-blue-600 justify-end'
                  : isLight
                    ? 'bg-slate-300 justify-start'
                    : 'bg-zinc-700 justify-start',
              )}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !localFeel.hapticsEnabled
              updateLocalFeel({ hapticsEnabled: next })
              if (next) triggerHaptic('confirm')
            }}
            className="ak-well w-full px-3.5 py-3 rounded-2xl border flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Vibrate className="w-4 h-4 ak-text-2" />
              <div className="text-left">
                <div className="ak-text-1 text-xs font-semibold">触觉振动反馈</div>
                <div className="ak-text-2 text-[11px]">按键确认、归中双振与语音起止震感</div>
              </div>
            </div>
            <span
              className={clsx(
                'w-10 h-6 rounded-full p-0.5 transition-colors inline-flex items-center shrink-0',
                localFeel.hapticsEnabled
                  ? 'bg-blue-600 justify-end'
                  : isLight
                    ? 'bg-slate-300 justify-start'
                    : 'bg-zinc-700 justify-start',
              )}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              updateLocalFeel({ keepScreenOn: !localFeel.keepScreenOn })
            }}
            className="ak-well w-full px-3.5 py-3 rounded-2xl border flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Monitor className="w-4 h-4 ak-text-2" />
              <div className="text-left">
                <div className="ak-text-1 text-xs font-semibold">连接时保持屏幕常亮</div>
                <div className="ak-text-2 text-[11px]">防止遥控或语音输入途中手机自动息屏</div>
              </div>
            </div>
            <span
              className={clsx(
                'w-10 h-6 rounded-full p-0.5 transition-colors inline-flex items-center shrink-0',
                localFeel.keepScreenOn
                  ? 'bg-blue-600 justify-end'
                  : isLight
                    ? 'bg-slate-300 justify-start'
                    : 'bg-zinc-700 justify-start',
              )}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
            </span>
          </button>
        </div>

        {/* About & In-App Update Row */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setOpen(false)
            setAboutSheetOpen(true)
          }}
          aria-label="关于与版本更新"
          className="tile-surface ak-well w-full px-3.5 py-3 rounded-2xl border flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Info className="w-4 h-4 ak-text-2 shrink-0" />
            <div className="min-w-0">
              <div className="ak-text-1 text-xs font-semibold">关于 Axonkey Mobile 与检查更新</div>
              <div className="ak-text-2 text-[11px] truncate">
                GitHub 在线检查更新 · 开源仓库直达
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="ak-code-chip ak-text-2 px-2 py-0.5 rounded-md border text-[11px] font-mono">
              v{versionInfo.versionName}
            </span>
            <ChevronRight className="w-4 h-4 ak-text-3" />
          </div>
        </button>

        {/* Clear Separation of Responsibility Notice */}
        <div
          className={clsx(
            'p-3.5 rounded-2xl border flex items-start gap-2.5',
            isLight
              ? 'bg-blue-600/8 border-blue-500/25'
              : 'bg-blue-500/10 border-blue-400/20',
          )}
        >
          <Sparkles
            className={clsx('w-4 h-4 shrink-0 mt-0.5', isLight ? 'text-blue-600' : 'text-blue-300')}
          />
          <div className="ak-text-2 text-[11.5px] leading-relaxed">
            <span className={clsx('font-semibold', isLight ? 'text-blue-800' : 'text-blue-200')}>
              按键映射在电脑端实时配置：
            </span>
            前往电脑端 Axonkey「设备管理 → Axonkey Mobile」点选按键热区，即可自定义快捷键、宏、语音触发键（如豆包{' '}
            <code className="ak-code-chip px-1 py-0.5 rounded border font-mono text-[10.5px]">
              Alt
            </code>
            ）与前台应用自动切换方案，手机端毫秒级同步生效。
          </div>
        </div>
      </div>
    </div>
  )
}
