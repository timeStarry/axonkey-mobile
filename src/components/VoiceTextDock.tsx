import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Keyboard, Mic, Send } from 'lucide-react'
import { clsx } from 'clsx'
import type { TextCommitMode } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { isNativeShell, triggerHaptic } from '../transport/nativeBridge'

const WAVE_WEIGHTS = [0.35, 0.6, 0.88, 1.0, 0.88, 0.6, 0.35]
const CANCEL_SLIDE_PX = 42

interface VoiceTextDockProps {
  compactLandscape?: boolean
}

export function VoiceTextDock({ compactLandscape = false }: VoiceTextDockProps) {
  const dockMode = useMobileStore((s) => s.localFeel.preferredDockMode)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const updateLocalFeel = useMobileStore((s) => s.updateLocalFeel)
  const sendText = useMobileStore((s) => s.sendText)
  const getClient = useMobileStore((s) => s.getClient)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
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

  useEffect(() => {
    if (!connected && recordingRef.current) {
      recordingRef.current = false
      cancelingRef.current = false
      setRecording(false)
      setCanceling(false)
      getClient().cancelVoiceStream('disconnected')
    }
  }, [connected, getClient])

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

  if (compactLandscape) {
    return (
      <div className="mt-auto pt-2 border-t ak-border-subtle space-y-1.5">
        {dockMode === 'voice' ? (
          <div className="flex items-stretch gap-1.5">
            <button
              type="button"
              onClick={toggleDockMode}
              aria-label="切换到键盘输入"
              className="tile-surface ak-elevated ak-text-2 w-10 h-11 rounded-[16px] border inline-flex items-center justify-center shrink-0 touch-none"
            >
              <Keyboard className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={!connected}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId)
                startHoldVoice(e.clientY)
              }}
              onPointerMove={(e) => moveHoldVoice(e.clientY)}
              onPointerUp={() => finishHoldVoice(false)}
              onPointerCancel={() => finishHoldVoice(true)}
              className={clsx(
                'relative flex-1 h-11 px-2.5 rounded-[16px] border text-xs font-semibold inline-flex items-center justify-center gap-1.5 select-none touch-none transition-all',
                !connected
                  ? 'ak-pill ak-text-3 opacity-80'
                  : canceling
                    ? 'bg-rose-500 text-white border-rose-500'
                    : recording
                      ? 'ak-primary-solid'
                      : 'tile-surface ak-voice-idle',
              )}
            >
              {connected && !canceling && (
                <span
                  className={clsx(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    recording ? 'bg-current animate-pulse' : 'ak-live-dot',
                  )}
                />
              )}
              <span className="truncate">
                {!connected
                  ? '未连接'
                  : canceling
                    ? '松开取消'
                    : recording
                      ? '正在聆听 · 松开发送'
                      : '按住说话'}
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
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
              placeholder="输入文字…"
              className="ak-input w-full h-9 px-2.5 rounded-[14px] border text-xs focus:outline-none"
            />
            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={toggleDockMode}
                aria-label="切换到按住说话"
                className="tile-surface ak-elevated ak-text-2 h-8 rounded-[12px] border inline-flex items-center justify-center"
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  setTextMode((m) => (m === 'paste' ? 'type' : 'paste'))
                }}
                aria-label="切换文本注入方式"
                className="tile-surface ak-elevated ak-text-2 h-8 rounded-[12px] border text-[10px] font-medium"
              >
                {textMode === 'paste' ? '粘贴' : '键入'}
              </button>
              <button
                type="button"
                disabled={sendDisabled}
                onClick={() => handleSendText(false)}
                aria-label="仅发送文本"
                className="tile-surface ak-elevated ak-text-1 h-8 rounded-[12px] border disabled:opacity-40 inline-flex items-center justify-center"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={sendDisabled}
                onClick={() => handleSendText(true)}
                aria-label="发送并回车"
                className="ak-primary-solid h-8 rounded-[12px] border disabled:opacity-40 inline-flex items-center justify-center"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="ak-dock shrink-0 px-3.5 pt-1 safe-bottom">
      {delivery &&
        delivery.status !== 'ok' &&
        delivery.status !== 'sent' &&
        dockMode === 'text' && (
          <div
            className={clsx(
              'mb-1.5 px-2.5 py-1 rounded-xl border text-[11px] truncate',
              isLight
                ? 'bg-amber-500/12 border-amber-500/30 text-amber-900'
                : 'bg-amber-500/15 border-amber-400/25 text-amber-200',
            )}
          >
            {delivery.message ?? '发送状态未知'}
          </div>
        )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleDockMode}
          aria-label={dockMode === 'voice' ? '切换到键盘输入' : '切换到按住说话'}
          className="tile-surface ak-elevated ak-text-2 h-[52px] w-[48px] rounded-[18px] border inline-flex items-center justify-center shrink-0 touch-none"
        >
          {dockMode === 'voice' ? (
            <Keyboard className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        {dockMode === 'voice' ? (
          <button
            type="button"
            disabled={!connected}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId)
              startHoldVoice(e.clientY)
            }}
            onPointerMove={(e) => moveHoldVoice(e.clientY)}
            onPointerUp={() => finishHoldVoice(false)}
            onPointerCancel={() => finishHoldVoice(true)}
            className={clsx(
              'relative flex-1 h-[52px] px-4 rounded-[18px] border text-[13px] font-semibold inline-flex items-center justify-center gap-2.5 select-none touch-none transition-all overflow-hidden',
              !connected
                ? 'ak-pill ak-text-3 opacity-80'
                : canceling
                  ? 'bg-rose-500 text-white border-rose-500 scale-[0.985]'
                  : recording
                    ? 'ak-primary-solid scale-[0.985]'
                    : 'tile-surface ak-voice-idle',
            )}
          >
            {!connected ? (
              <span>未连接</span>
            ) : canceling ? (
              <span>松开取消</span>
            ) : recording ? (
              <>
                <div className="flex items-center gap-[2.5px] h-4" aria-hidden="true">
                  {WAVE_WEIGHTS.map((w, idx) => {
                    const barHeight = Math.max(
                      4,
                      Math.round(16 * Math.min(1, effectiveLevel * w * 1.25)),
                    )
                    return (
                      <span
                        key={idx}
                        style={{ height: `${barHeight}px` }}
                        className="w-[2.5px] rounded-full bg-current transition-[height] duration-75"
                      />
                    )
                  })}
                </div>
                <span>正在聆听 · 松开发送</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full ak-live-dot shrink-0" />
                <span>按住说话</span>
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
              className="tile-surface ak-elevated ak-text-2 h-[52px] px-3 rounded-[18px] border text-xs font-medium shrink-0"
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
              placeholder="输入文字…"
              className="ak-input flex-1 min-w-0 h-[52px] px-3.5 rounded-[18px] border text-sm focus:outline-none"
            />

            <button
              type="button"
              disabled={sendDisabled}
              onClick={() => handleSendText(false)}
              aria-label="仅发送文本"
              className="tile-surface ak-elevated ak-text-1 h-[52px] w-11 rounded-[18px] inline-flex items-center justify-center border disabled:opacity-40 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={sendDisabled}
              onClick={() => handleSendText(true)}
              aria-label="发送并回车"
              className="ak-primary-solid h-[52px] w-11 rounded-[18px] border inline-flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform shrink-0"
            >
              <CornerDownLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
