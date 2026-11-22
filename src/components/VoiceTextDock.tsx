import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Keyboard, Mic, Send, X } from 'lucide-react'
import { clsx } from 'clsx'
import type { TextCommitMode } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { isNativeShell, triggerHaptic } from '../transport/nativeBridge'

const WAVE_WEIGHTS = [0.35, 0.58, 0.82, 0.96, 1.0, 0.96, 0.82, 0.58, 0.35]
const CANCEL_SLIDE_PX = 42

export function VoiceTextDock() {
  const dockMode = useMobileStore((s) => s.localFeel.preferredDockMode)
  const updateLocalFeel = useMobileStore((s) => s.updateLocalFeel)
  const sendText = useMobileStore((s) => s.sendText)
  const getClient = useMobileStore((s) => s.getClient)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
  const voiceBindingSummary = useMobileStore((s) => s.deck.voiceBindingSummary)
  const voiceLevel = useMobileStore((s) => s.voiceLevel)
  const delivery = useMobileStore((s) => s.textDelivery)

  const [text, setText] = useState('')
  const [textMode, setTextMode] = useState<TextCommitMode>('paste')
  const [recording, setRecording] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [simLevel, setSimLevel] = useState(0.3)

  const startYRef = useRef<number>(0)
  const cancelingRef = useRef<boolean>(false)
  const recordingRef = useRef<boolean>(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const connected = phase === 'active'
  const sendDisabled = !connected || !text.trim()

  // Abort active voice cleanly if session drops while holding
  useEffect(() => {
    if (!connected && recordingRef.current) {
      recordingRef.current = false
      cancelingRef.current = false
      setRecording(false)
      setCanceling(false)
      getClient().cancelVoiceStream('disconnected')
    }
  }, [connected, getClient])

  // Gentle organic level animation in Demo / non-native preview so waveform is verifiable visually
  useEffect(() => {
    if (!recording || (!isDemoMode && isNativeShell())) return
    let tick = 0
    const timer = setInterval(() => {
      tick += 1
      const v = 0.28 + 0.45 * Math.abs(Math.sin(tick * 0.42)) + 0.15 * Math.abs(Math.cos(tick * 0.9))
      setSimLevel(Math.min(1, v))
    }, 65)
    return () => clearInterval(timer)
  }, [recording, isDemoMode])

  const effectiveLevel =
    !isDemoMode && isNativeShell() ? Math.max(0.08, voiceLevel) : Math.max(0.12, simLevel)

  const bindingTrimmed = voiceBindingSummary?.trim() || null
  const idleVoiceLabel = bindingTrimmed
    ? `按住说话 · ${bindingTrimmed} + 虚拟麦`
    : '按住说话 · 虚拟麦克风'

  const handleSendText = (submit: boolean) => {
    if (sendDisabled) return
    triggerHaptic('tap')
    if (sendText(text.trim(), textMode, submit)) {
      setText('')
    }
  }

  const startHoldVoice = (clientY: number) => {
    if (!connected || recordingRef.current) return
    const ok = getClient().startVoiceStream()
    if (!ok) {
      triggerHaptic('error')
      return
    }
    startYRef.current = clientY
    cancelingRef.current = false
    recordingRef.current = true
    setCanceling(false)
    setRecording(true)
    triggerHaptic('voiceStart')
  }

  const moveHoldVoice = (clientY: number) => {
    if (!recordingRef.current) return
    const shouldCancel = startYRef.current - clientY >= CANCEL_SLIDE_PX
    if (shouldCancel !== cancelingRef.current) {
      cancelingRef.current = shouldCancel
      setCanceling(shouldCancel)
      triggerHaptic('tap')
    }
  }

  const finishHoldVoice = (forceCancel = false) => {
    if (!recordingRef.current) return
    const wasCanceling = forceCancel || cancelingRef.current
    recordingRef.current = false
    cancelingRef.current = false
    setRecording(false)
    setCanceling(false)

    if (wasCanceling) {
      triggerHaptic('error')
      getClient().cancelVoiceStream('user_cancelled')
    } else {
      triggerHaptic('voiceStop')
      getClient().stopVoiceStream()
    }
  }

  const toggleDockMode = () => {
    triggerHaptic('tap')
    if (recordingRef.current) {
      finishHoldVoice(true)
    }
    const next = dockMode === 'voice' ? 'text' : 'voice'
    updateLocalFeel({ preferredDockMode: next })
    if (next === 'text') {
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }

  return (
    <div className="shrink-0 px-3 pt-1.5 safe-bottom bg-[#0c0f16] border-t border-white/[0.07]">
      {delivery &&
        delivery.status !== 'ok' &&
        delivery.status !== 'sent' &&
        dockMode === 'text' && (
          <div className="mb-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/25 text-[11px] text-amber-200 truncate">
            {delivery.message ?? '文本发送状态未知'}
          </div>
        )}

      <div className="flex items-center gap-2">
        {/* Seamless Voice <-> Keyboard Toggle */}
        <button
          type="button"
          onClick={toggleDockMode}
          aria-label={dockMode === 'voice' ? '切换到键盘输入' : '切换到按住说话'}
          className={clsx(
            'tile-surface h-11 w-11 rounded-2xl inline-flex items-center justify-center border shrink-0',
            dockMode === 'voice'
              ? 'bg-[#151923] border-white/[0.09] text-zinc-300'
              : 'bg-blue-500/20 border-blue-400/45 text-blue-200',
          )}
        >
          {dockMode === 'voice' ? <Keyboard className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        {dockMode === 'voice' ? (
          <button
            type="button"
            disabled={!connected}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              startHoldVoice(e.clientY)
            }}
            onPointerMove={(e) => moveHoldVoice(e.clientY)}
            onPointerUp={() => finishHoldVoice(false)}
            onPointerCancel={() => finishHoldVoice(true)}
            className={clsx(
              'relative flex-1 h-11 px-3.5 rounded-2xl border text-xs font-semibold inline-flex items-center justify-center gap-2.5 select-none touch-none transition-all overflow-hidden',
              !connected
                ? 'bg-white/[0.03] border-white/[0.06] text-zinc-500'
                : canceling
                  ? 'bg-amber-500/25 border-amber-400/65 text-amber-100 scale-[0.985]'
                  : recording
                    ? 'bg-gradient-to-r from-blue-600/35 via-indigo-500/35 to-blue-600/35 border-blue-400/75 text-white shadow-[0_0_22px_rgba(59,130,246,0.35)] scale-[0.985]'
                    : 'tile-surface bg-[#161b26] border-white/[0.11] text-zinc-100',
            )}
          >
            {!connected ? (
              <>
                <Mic className="w-4 h-4 text-zinc-500" />
                <span>连接电脑后启用语音键</span>
              </>
            ) : canceling ? (
              <>
                <X className="w-4 h-4 text-amber-300" />
                <span>松开手指 · 立即取消本次语音</span>
              </>
            ) : recording ? (
              <>
                {/* Live 9-Bar Symmetric Audio Waveform */}
                <div className="flex items-center gap-[3px] h-5" aria-hidden="true">
                  {WAVE_WEIGHTS.map((w, idx) => {
                    const barHeight = Math.max(4, Math.round(20 * Math.min(1, effectiveLevel * w * 1.25)))
                    return (
                      <span
                        key={idx}
                        style={{ height: `${barHeight}px` }}
                        className="w-[3px] rounded-full bg-blue-300 transition-[height] duration-75"
                      />
                    )
                  })}
                </div>
                <span className="truncate">
                  {bindingTrimmed ? `${bindingTrimmed} 按住中 · 松开发送` : '录音中 · 松开发送（上滑取消）'}
                </span>
              </>
            ) : (
              <>
                <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 inline-flex items-center justify-center shrink-0">
                  <Mic className="w-3.5 h-3.5" />
                </span>
                <span className="text-[13px] font-semibold tracking-wide truncate">
                  {idleVoiceLabel}
                </span>
              </>
            )}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                setTextMode((m) => (m === 'paste' ? 'type' : 'paste'))
              }}
              className="tile-surface h-11 px-2.5 rounded-2xl bg-[#151923] border border-white/[0.09] text-[11px] font-medium text-zinc-300 shrink-0"
              aria-label="切换文本注入方式"
            >
              {textMode === 'paste' ? '粘贴' : '键入'}
            </button>

            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendText(true)
                }
              }}
              placeholder="输入文字或手机语音输入法直达电脑…"
              className="flex-1 min-w-0 h-11 px-3 rounded-2xl bg-[#141822] border border-white/[0.1] text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-400/60"
            />

            <button
              type="button"
              disabled={sendDisabled}
              onClick={() => handleSendText(false)}
              aria-label="仅发送文本"
              className={clsx(
                'h-11 w-10 rounded-2xl inline-flex items-center justify-center border transition-colors shrink-0',
                sendDisabled
                  ? 'bg-white/[0.03] border-white/[0.05] text-zinc-600'
                  : 'tile-surface bg-[#181d29] border-white/[0.12] text-zinc-100',
              )}
            >
              <Send className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={sendDisabled}
              onClick={() => handleSendText(true)}
              aria-label="发送并回车"
              className={clsx(
                'h-11 px-3 rounded-2xl inline-flex items-center justify-center gap-1 text-xs font-semibold transition-all shrink-0',
                sendDisabled
                  ? 'bg-blue-500/15 text-blue-300/35 border border-blue-400/10'
                  : 'bg-blue-500 text-white border border-blue-400 shadow-sm shadow-blue-500/30 active:scale-95',
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
