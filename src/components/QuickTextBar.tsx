import { useEffect, useState } from 'react'
import { CornerDownLeft, Keyboard, Mic, Send } from 'lucide-react'
import { clsx } from 'clsx'
import type { TextCommitMode } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'

export function QuickTextBar() {
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<TextCommitMode>('paste')
  const [recording, setRecording] = useState(false)

  const sendText = useMobileStore((s) => s.sendText)
  const getClient = useMobileStore((s) => s.getClient)
  const phase = useMobileStore((s) => s.phase)
  const delivery = useMobileStore((s) => s.textDelivery)

  const connected = phase === 'active'
  const sendDisabled = !connected || !text.trim()

  useEffect(() => {
    if (!connected && recording) {
      setRecording(false)
      getClient().stopVoiceStream()
    }
  }, [connected, recording, getClient])

  const handleSend = (submit: boolean) => {
    if (sendDisabled) return
    triggerHaptic('tap')
    if (sendText(text.trim(), mode, submit)) {
      setText('')
    }
  }

  const startVoice = () => {
    if (!connected || recording) return
    triggerHaptic('heavy')
    if (getClient().startVoiceStream()) {
      setRecording(true)
    } else {
      triggerHaptic('error')
    }
  }

  const stopVoice = () => {
    if (!recording) return
    setRecording(false)
    triggerHaptic('tap')
    getClient().stopVoiceStream()
  }

  return (
    <div className="shrink-0 border-t border-white/[0.08] bg-[#10131a]/95 backdrop-blur-md px-3 pt-2 safe-bottom">
      {delivery && delivery.status !== 'ok' && delivery.status !== 'sent' && inputMode === 'text' && (
        <div className="mb-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/25 text-[11px] text-amber-200 truncate">
          {delivery.message ?? '文本发送状态未知'}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Voice / Text Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            if (recording) stopVoice()
            setInputMode((m) => (m === 'text' ? 'voice' : 'text'))
          }}
          aria-label={inputMode === 'text' ? '切换到语音输入' : '切换到文本输入'}
          className={clsx(
            'h-10 w-10 rounded-xl inline-flex items-center justify-center border transition-colors shrink-0',
            inputMode === 'voice'
              ? 'bg-blue-500/20 border-blue-400/45 text-blue-300'
              : 'bg-white/[0.06] border-white/[0.08] text-zinc-300',
          )}
        >
          {inputMode === 'text' ? <Mic className="w-4 h-4" /> : <Keyboard className="w-4 h-4" />}
        </button>

        {inputMode === 'voice' ? (
          <button
            type="button"
            disabled={!connected}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              startVoice()
            }}
            onPointerUp={stopVoice}
            onPointerCancel={stopVoice}
            className={clsx(
              'flex-1 h-10 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-2 select-none touch-none transition-all',
              !connected
                ? 'bg-white/[0.03] border-white/[0.06] text-zinc-600'
                : recording
                  ? 'bg-rose-500/25 border-rose-400/60 text-rose-200 scale-[0.985]'
                  : 'bg-[#181c26] border-white/[0.1] text-zinc-100 active:scale-[0.985]',
            )}
          >
            <span
              className={clsx(
                'w-2 h-2 rounded-full',
                recording ? 'bg-rose-400 animate-ping' : 'bg-blue-400',
              )}
            />
            <span>{recording ? '松开结束 · 正在传输语音…' : '按住说话 · 传至桌面麦克风'}</span>
          </button>
        ) : (
          <>
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
              placeholder="输入 Prompt 直达桌面…"
              className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-[#181c26] border border-white/[0.09] text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-400/60"
            />

            <button
              type="button"
              disabled={sendDisabled}
              onClick={() => handleSend(false)}
              aria-label="发送文本"
              className={clsx(
                'h-10 w-10 rounded-xl inline-flex items-center justify-center border transition-colors shrink-0',
                sendDisabled
                  ? 'bg-white/[0.03] border-white/[0.05] text-zinc-600'
                  : 'bg-white/[0.08] border-white/[0.12] text-zinc-100 active:scale-95',
              )}
            >
              <Send className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={sendDisabled}
              onClick={() => handleSend(true)}
              aria-label="发送并回车"
              className={clsx(
                'h-10 px-3 rounded-xl inline-flex items-center justify-center gap-1 text-xs font-semibold transition-all shrink-0',
                sendDisabled
                  ? 'bg-blue-500/20 text-blue-300/40'
                  : 'bg-blue-500 text-white shadow-sm shadow-blue-500/30 active:scale-95',
              )}
            >
              <CornerDownLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
