import { Monitor, SlidersHorizontal, Sparkles, Vibrate, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useMobileStore, type PointerSubMode } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'

export function LocalFeelSheet() {
  const open = useMobileStore((s) => s.feelSheetOpen)
  const setOpen = useMobileStore((s) => s.setFeelSheetOpen)
  const deck = useMobileStore((s) => s.deck)
  const localFeel = useMobileStore((s) => s.localFeel)
  const updateLocalFeel = useMobileStore((s) => s.updateLocalFeel)
  const updateSensitivity = useMobileStore((s) => s.updateSensitivity)

  if (!open) return null

  const gyroOptions: { id: PointerSubMode; label: string }[] = [
    { id: 'trackpad', label: '触控板优先' },
    { id: 'relative', label: '体感空鼠' },
    { id: 'absolute', label: '归中瞄准' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-[#121620] border-t border-white/[0.1] p-5 safe-bottom space-y-4 max-h-[86vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-400" />
            <h2 className="text-base font-semibold text-zinc-100">本地操控手感</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-full bg-white/[0.06] inline-flex items-center justify-center text-zinc-400"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sliders Group */}
        <div className="space-y-3.5 p-3.5 rounded-2xl bg-[#0d1018] border border-white/[0.07]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-200">触控板指针灵敏度</span>
              <span className="font-mono text-blue-300">{deck.pointerSensitivity.toFixed(1)}×</span>
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
              <span className="font-medium text-zinc-200">双指滚轮灵敏度</span>
              <span className="font-mono text-blue-300">{deck.scrollSensitivity.toFixed(1)}×</span>
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
              <span className="font-medium text-zinc-200">陀螺仪体感灵敏度</span>
              <span className="font-mono text-blue-300">
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

        {/* Default Pointer Sub-Mode */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-zinc-400">默认指针子模式</div>
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#0d1018] border border-white/[0.07]">
            {gyroOptions.map((opt) => {
              const active = localFeel.preferredPointerSubMode === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    updateLocalFeel({ preferredPointerSubMode: opt.id })
                  }}
                  className={clsx(
                    'h-8 rounded-xl text-xs font-semibold transition-colors',
                    active ? 'bg-blue-500 text-white' : 'text-zinc-400',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Toggles: Haptics & Keep Screen On */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              const next = !localFeel.hapticsEnabled
              updateLocalFeel({ hapticsEnabled: next })
              if (next) triggerHaptic('confirm')
            }}
            className="w-full px-3.5 py-3 rounded-2xl bg-[#0d1018] border border-white/[0.07] flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Vibrate className="w-4 h-4 text-zinc-300" />
              <div className="text-left">
                <div className="text-xs font-semibold text-zinc-100">触觉振动反馈</div>
                <div className="text-[11px] text-zinc-400">按键确认、长按重击与语音起止震感</div>
              </div>
            </div>
            <span
              className={clsx(
                'w-10 h-6 rounded-full p-0.5 transition-colors inline-flex items-center',
                localFeel.hapticsEnabled ? 'bg-blue-500 justify-end' : 'bg-zinc-700 justify-start',
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
            className="w-full px-3.5 py-3 rounded-2xl bg-[#0d1018] border border-white/[0.07] flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Monitor className="w-4 h-4 text-zinc-300" />
              <div className="text-left">
                <div className="text-xs font-semibold text-zinc-100">连接时保持屏幕常亮</div>
                <div className="text-[11px] text-zinc-400">防止遥控或语音输入途中手机自动息屏</div>
              </div>
            </div>
            <span
              className={clsx(
                'w-10 h-6 rounded-full p-0.5 transition-colors inline-flex items-center',
                localFeel.keepScreenOn ? 'bg-blue-500 justify-end' : 'bg-zinc-700 justify-start',
              )}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
            </span>
          </button>
        </div>

        {/* Clear Separation of Responsibility Notice */}
        <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-400/20 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-zinc-300 leading-relaxed">
            <span className="font-semibold text-blue-200">按键映射在电脑端实时配置：</span>
            前往电脑端 Axonkey「设备管理 → Axonkey Mobile」点选按键热区，即可自定义快捷键、宏、语音触发键（如豆包{' '}
            <code className="px-1 py-0.5 rounded bg-white/10 font-mono text-[10.5px]">Alt</code>）与前台应用自动切换方案，手机端毫秒级同步生效。
          </div>
        </div>
      </div>
    </div>
  )
}
