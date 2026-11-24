import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Keyboard, Mic, Send, X } from 'lucide-react'
import { clsx } from 'clsx'
import type { TextCommitMode } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { isNativeShell, triggerHaptic } from '../transport/nativeBridge'

const WAVE_WEIGHTS = [0.3, 0.48, 0.68, 0.86, 0.96, 1.0, 0.96, 0.86, 0.68, 0.48, 0.3]
const CANCEL_SLIDE_PX = 42

export function VoiceTextDock() {
  const dockMode = useMobileStore((s) => s.localFeel.preferredDockMode)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const updateLocalFeel = useMobileStore((s) => s.updateLocalFeel)
  const sendText = useMobileStore((s) => s.sendText)
  const getClient = useMobileStore((s) => s.getClient)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
  const voiceBindingSummary = useMobileStore((s) => s.deck.voiceBindingSummary)
  const voiceLevel = useMobileStore((s) => s.voiceLevel)
  const delivery = useMobileStore((s) => s.textDelivery)

  const isLight = effectiveTheme === 'light'

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
      const v =
        0.28 + 0.45 * Math.abs(Math.sin(tick * 0.42)) + 0.15 * Math.abs(Math.cos(tick * 0.9))
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
    <div className="ak-dock shrink-0 px-3 pt-1.5 safe-bottom">
      {delivery &&
        delivery.status !== 'ok' &&
        delivery.status !== 'sent' &&
        dockMode === 'text' && (
          <div
            className={clsx(
              'mb-1.5 px-2.5 py-1 rounded-lg border text-[11px] truncate',
              isLight
                ? 'bg-amber-500/15 border-amber-500/35 text-amber-900'
                : 'bg-amber-500/15 border-amber-400/25 text-amber-200',
            )}
          >
            {delivery.message ?? '文本发送状态未知'}
          </div>
        )}

      <div className="flex items-center gap-2.5">
        {/* Seamless Voice <-> Keyboard Toggle (Enlarged Blind-Touch Pad) */}
        <button
          type="button"
          onClick={toggleDockMode}
          aria-label={dockMode === 'voice' ? '切换到键盘输入' : '切换到按住说话'}
          className={clsx(
            'tile-surface rounded-[20px] inline-flex flex-col items-center justify-center gap-0.5 border shrink-0 touch-none',
            dockMode === 'voice'
              ? 'h-[60px] w-[58px] ak-elevated ak-text-2'
              : clsx(
                  'h-[54px] w-[54px]',
                  isLight
                    ? 'bg-blue-600/12 border-blue-500/40 text-blue-700'
                    : 'bg-blue-500/20 border-blue-400/45 text-blue-200',
                ),
          )}
        >
          {dockMode === 'voice' ? (
            <>
              <Keyboard className="w-[18px] h-[18px]" />
              <span className="text-[10px] font-medium ak-text-3">键盘</span>
            </>
          ) : (
            <>
              <Mic className="w-[18px] h-[18px]" />
              <span className="text-[10px] font-semibold">语音</span>
            </>
          )}
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
              'relative flex-1 h-[60px] px-4 rounded-[20px] border text-sm font-semibold inline-flex items-center justify-center gap-3 select-none touch-none transition-all overflow-hidden',
              !connected
                ? 'ak-pill ak-text-3 opacity-80'
                : canceling
                  ? isLight
                    ? 'bg-amber-500 text-white border-amber-600 scale-[0.985]'
                    : 'bg-amber-500/25 border-amber-400/65 text-amber-100 scale-[0.985]'
                  : recording
                    ? isLight
                      ? 'bg-blue-600 text-white border-blue-700 shadow-[0_6px_22px_rgba(37,99,235,0.35)] scale-[0.985]'
                      : 'bg-gradient-to-r from-blue-600/40 via-indigo-500/40 to-blue-600/40 border-blue-400/80 text-white shadow-[0_0_26px_rgba(59,130,246,0.4)] scale-[0.985]'
                    : 'tile-surface ak-voice-idle',
            )}
          >
            {!connected ? (
              <>
                <Mic className="w-4.5 h-4.5 ak-text-3" />
                <span>连接电脑后启用语音键</span>
              </>
            ) : canceling ? (
              <>
                <X className={clsx('w-5 h-5', isLight ? 'text-white' : 'text-amber-300')} />
                <span>松开手指 · 立即取消本次语音</span>
              </>
            ) : recording ? (
              <>
                {/* Live 11-Bar Symmetric Audio Waveform */}
                <div className="flex items-center gap-[3px] h-6" aria-hidden="true">
                  {WAVE_WEIGHTS.map((w, idx) => {
                    const barHeight = Math.max(
                      5,
                      Math.round(24 * Math.min(1, effectiveLevel * w * 1.25)),
                    )
                    return (
                      <span
                        key={idx}
                        style={{ height: `${barHeight}px` }}
                        className={clsx(
                          'w-[3.5px] rounded-full transition-[height] duration-75',
                          isLight ? 'bg-white' : 'bg-blue-300',
                        )}
                      />
                    )
                  })}
                </div>
                <span className="text-[13.5px] truncate">
                  {bindingTrimmed
                    ? `${bindingTrimmed} 按住中 · 松开发送`
                    : '录音中 · 松开发送（上滑取消）'}
                </span>
              </>
            ) : (
              <>
                <span
                  className={clsx(
                    'w-8 h-8 rounded-xl border inline-flex items-center justify-center shrink-0',
                    isLight
                      ? 'bg-blue-600/12 border-blue-500/25 text-blue-600'
                      : 'bg-blue-500/22 border-blue-400/25 text-blue-300',
                  )}
                >
                  <Mic className="w-4 h-4" />
                </span>
                <span className="text-[14.5px] font-bold tracking-wide truncate">
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
              className="tile-surface ak-elevated ak-text-2 h-[54px] px-3 rounded-[18px] border text-xs font-medium shrink-0"
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
              placeholder="输入文字或手机语音直达电脑…"
              className="ak-input flex-1 min-w-0 h-[54px] px-3.5 rounded-[18px] border text-sm focus:outline-none focus:border-blue-500"
            />

            <button
              type="button"
              disabled={sendDisabled}
              onClick={() => handleSendText(false)}
              aria-label="仅发送文本"
              className={clsx(
                'h-[54px] w-12 rounded-[18px] inline-flex items-center justify-center border transition-colors shrink-0',
                sendDisabled
                  ? 'ak-pill ak-text-3 opacity-50'
                  : 'tile-surface ak-elevated ak-text-1',
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
                'h-[54px] px-3.5 rounded-[18px] inline-flex items-center justify-center gap-1 text-xs font-semibold transition-all shrink-0',
                sendDisabled
                  ? 'bg-blue-500/15 text-blue-400/50 border border-blue-400/15'
                  : 'bg-blue-600 text-white border border-blue-500 shadow-sm shadow-blue-500/25 active:scale-95',
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
