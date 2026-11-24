import { useState } from 'react'
import {
  Check,
  Code2,
  Gamepad2,
  LayoutTemplate,
  Mic,
  Presentation,
  Wand2,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { StarterPresetId, VoicePresetKind } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'

const STARTER_PRESETS: readonly {
  id: StarterPresetId
  title: string
  badge: string
  desc: string
  icon: typeof Gamepad2
}[] = [
  {
    id: 'daily-remote',
    title: '日常遥控 + 语音输入',
    badge: '推荐开箱',
    desc: '经典九宫格方向盘 + 日常影音浏览快捷页，躺在沙发单手掌控电脑与语音输入。',
    icon: Gamepad2,
  },
  {
    id: 'vibe-coding',
    title: 'AI 编程副屏',
    badge: '开发者最爱',
    desc: '内置「继续执行」「接受变更 Ctrl+Enter」「撤销 Ctrl+Z」「终端 Ctrl+`」高频大键。',
    icon: Code2,
  },
  {
    id: 'presentation-media',
    title: '演示与影音',
    badge: '演讲 / 观影',
    desc: '巨幅翻页键、全屏放映 F5、黑屏休场 B、播放静音 + 演讲触控混排台。',
    icon: Presentation,
  },
  {
    id: 'blank-canvas',
    title: '从空白开始 · 纯净自定义',
    badge: '零预设干扰',
    desc: '仅保留单页 2 列空白按键（零默认快捷键注入），完全按你的习惯自由搭建。',
    icon: LayoutTemplate,
  },
] as const

const VOICE_PRESETS: readonly {
  id: VoicePresetKind
  label: string
  sub: string
}[] = [
  { id: 'doubao-alt', label: 'Alt 豆包语音', sub: '按住 Alt + 虚拟麦' },
  { id: 'system-win-h', label: 'Win+H 系统听写', sub: '触发 Windows 听写' },
  { id: 'ctrl-win', label: 'Ctrl+Win', sub: '自定义语音热键' },
  { id: 'pure-mic', label: '纯虚拟麦', sub: '仅传音频不按键' },
] as const

export function PresetWizardSheet() {
  const open = useMobileStore((s) => s.presetWizardOpen)
  const setOpen = useMobileStore((s) => s.setPresetWizardOpen)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const applyStarterPreset = useMobileStore((s) => s.applyStarterPreset)

  const isLight = effectiveTheme === 'light'

  const [selectedPreset, setSelectedPreset] = useState<StarterPresetId>('daily-remote')
  const [selectedVoice, setSelectedVoice] = useState<VoicePresetKind>('doubao-alt')
  const [userPickedVoice, setUserPickedVoice] = useState(false)

  if (!open) return null

  const handleSelectPreset = (id: StarterPresetId) => {
    triggerHaptic('tap')
    setSelectedPreset(id)
    if (!userPickedVoice) {
      setSelectedVoice(id === 'blank-canvas' ? 'pure-mic' : 'doubao-alt')
    }
  }

  const handleSelectVoice = (voice: VoicePresetKind) => {
    triggerHaptic('tap')
    setUserPickedVoice(true)
    setSelectedVoice(voice)
  }

  const handleApply = () => {
    triggerHaptic('confirm')
    applyStarterPreset(selectedPreset, selectedVoice)
  }

  return (
    <div className="ak-backdrop fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm">
      <div className="ak-sheet w-full max-w-md rounded-t-3xl border-t p-5 safe-bottom space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wand2 className={clsx('w-4 h-4', isLight ? 'text-blue-600' : 'text-blue-400')} />
            <div>
              <h2 className="ak-text-1 text-base font-semibold">预设方案与开箱向导</h2>
              <p className="ak-text-3 text-[11px]">一键同步手机端面板布局与电脑端按键绑定</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭预设向导"
            className="ak-pill ak-text-2 w-8 h-8 rounded-full border inline-flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Starter Preset Cards */}
        <div className="space-y-2">
          {STARTER_PRESETS.map((item) => {
            const Icon = item.icon
            const active = selectedPreset === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectPreset(item.id)}
                className={clsx(
                  'tile-surface w-full p-3.5 rounded-2xl border flex items-start gap-3 text-left transition-all',
                  active
                    ? isLight
                      ? 'bg-blue-600/[0.08] border-blue-600 ring-1 ring-blue-600/30'
                      : 'bg-blue-500/15 border-blue-400/70 ring-1 ring-blue-400/30'
                    : 'ak-well',
                )}
              >
                <span
                  className={clsx(
                    'w-9 h-9 rounded-xl border inline-flex items-center justify-center shrink-0 mt-0.5',
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'ak-elevated ak-text-2',
                  )}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="ak-text-1 text-xs font-bold truncate">{item.title}</span>
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
                        active
                          ? 'bg-blue-600 text-white'
                          : 'ak-pill ak-text-2 border',
                      )}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p className="ak-text-2 text-[11px] leading-relaxed mt-1">{item.desc}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Voice Shortcut Preset Selector */}
        <div className="ak-well p-3.5 rounded-2xl border space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold ak-text-1">
            <Mic className={clsx('w-3.5 h-3.5', isLight ? 'text-blue-600' : 'text-blue-400')} />
            <span>底部「按住说话」电脑端联动热键</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {VOICE_PRESETS.map((vp) => {
              const active = selectedVoice === vp.id
              return (
                <button
                  key={vp.id}
                  type="button"
                  onClick={() => handleSelectVoice(vp.id)}
                  className={clsx(
                    'p-2 rounded-xl border text-left transition-all',
                    active
                      ? isLight
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-blue-500/25 border-blue-400 text-white'
                      : 'ak-elevated ak-text-2',
                  )}
                >
                  <div className="text-[11.5px] font-semibold truncate">{vp.label}</div>
                  <div
                    className={clsx(
                      'text-[10px] truncate mt-0.5',
                      active ? 'opacity-90' : 'ak-text-3',
                    )}
                  >
                    {vp.sub}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Confirm Apply Button */}
        <button
          type="button"
          onClick={handleApply}
          className="w-full h-11 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm shadow-blue-500/25 active:scale-[0.98] transition-transform"
        >
          <Check className="w-4 h-4" />
          <span>应用此预设方案</span>
        </button>
      </div>
    </div>
  )
}
