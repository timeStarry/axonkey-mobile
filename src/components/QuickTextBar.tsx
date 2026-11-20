import { useState } from 'react'
import { CornerDownLeft, Send } from 'lucide-react'
import { clsx } from 'clsx'
import type { TextCommitMode } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'

export function QuickTextBar() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<TextCommitMode>('paste')
  const sendText = useMobileStore((s) => s.sendText)
  const phase = useMobileStore((s) => s.phase)
  const delivery = useMobileStore((s) => s.textDelivery)

  const disabled = phase !== 'active' || !text.trim()

  const handleSend = (submit: boolean) => {
    if (disabled) return
    triggerHaptic('tap')
    if (sendText(text.trim(), mode, submit)) {
      setText('')
    }
  }

  return (
    <div className="shrink-0 border-t border-white/[0.08] bg-[#10131a]/95 backdrop-blur-md px-3 pt-2 safe-bottom">
      {delivery && delivery.status !== 'ok' && delivery.status !== 'sent' && (
        <div className="mb-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/25 text-[11px] text-amber-200 truncate">
          {delivery.message ?? '文本发送状态未知'}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setMode((m) => (m === 'paste' ? 'type' : 'paste'))
          }}
          className="h-10 px-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-[11px] font-medium text-zinc-300 shrink-0"
          aria-label="切换文本注入方式"
        >
          {mode === 'paste' ? '粘贴' : '键入'}
        </button>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(true)
            }
          }}
          placeholder="听写或输入 Prompt 直达桌面…"
          className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-[#181c26] border border-white/[0.09] text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-400/60"
        />

        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSend(false)}
          aria-label="发送文本"
          className={clsx(
            'h-10 w-10 rounded-xl inline-flex items-center justify-center border transition-colors shrink-0',
            disabled
              ? 'bg-white/[0.03] border-white/[0.05] text-zinc-600'
              : 'bg-white/[0.08] border-white/[0.12] text-zinc-100 active:scale-95',
          )}
        >
          <Send className="w-4 h-4" />
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSend(true)}
          aria-label="发送并回车"
          className={clsx(
            'h-10 px-3 rounded-xl inline-flex items-center justify-center gap-1 text-xs font-semibold transition-all shrink-0',
            disabled
              ? 'bg-blue-500/20 text-blue-300/40'
              : 'bg-blue-500 text-white shadow-sm shadow-blue-500/30 active:scale-95',
          )}
        >
          <CornerDownLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
