import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Crosshair,
  Info,
  Lock,
  LockOpen,
  Pause,
  Play,
  SlidersHorizontal,
} from 'lucide-react'
import { clsx } from 'clsx'
import { TrackpadController } from '../input/trackpad'
import type { PointerButtonName } from '../protocol/types'
import {
  useMobileStore,
  type AirMouseFeelMode,
  type PointerTabMode,
} from '../state/useMobileStore'
import {
  notifyNativePointerClickPulse,
  recenterNativeCursor,
  setNativeGyroClutch,
  setNativeGyroConfig,
  triggerHaptic,
} from '../transport/nativeBridge'

interface TrackpadSurfaceProps {
  className?: string
}

const ENCODER_NOTCH_PX = 22
const ENCODER_TICKS = Array.from({ length: 13 }, (_, i) => i)

let manualBtnSeq = 1
function nextManualPressId(button: PointerButtonName): string {
  manualBtnSeq += 1
  return `mbtn-${button}-${manualBtnSeq}`
}

export function TrackpadSurface({ className }: TrackpadSurfaceProps) {
  const getClient = useMobileStore((s) => s.getClient)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
  const pointerTab = useMobileStore((s) => s.pointerTab)
  const setPointerTab = useMobileStore((s) => s.setPointerTab)
  const airMouseFeel = useMobileStore((s) => s.airMouseFeel)
  const setAirMouseFeel = useMobileStore((s) => s.setAirMouseFeel)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const gyroSensitivity = useMobileStore((s) => s.localFeel.gyroSensitivity)
  const airMouseHandedness = useMobileStore((s) => s.localFeel.airMouseHandedness)
  const threeFingerSystemGestures = useMobileStore(
    (s) => s.localFeel.threeFingerSystemGestures,
  )
  const updateLocalFeel = useMobileStore((s) => s.updateLocalFeel)
  const setPointerSettingsOpen = useMobileStore((s) => s.setPointerSettingsOpen)
  const setPointerHelpOpen = useMobileStore((s) => s.setPointerHelpOpen)
  const showHudToast = useMobileStore((s) => s.showHudToast)
  const gyroGuard = useMobileStore((s) => s.gyroGuard)
  const clearGyroGuard = useMobileStore((s) => s.clearGyroGuard)

  const isLight = effectiveTheme === 'light'

  const [dragLocked, setDragLocked] = useState(false)
  const [clutchHeld, setClutchHeld] = useState(false)
  const [laserPaused, setLaserPaused] = useState(false)
  const [recenteredFlash, setRecenteredFlash] = useState(false)
  const [pressedButtons, setPressedButtons] = useState<Record<string, boolean>>({})
  const [railOffsetTick, setRailOffsetTick] = useState(0)

  const heldManualButtons = useRef<Map<PointerButtonName, string>>(new Map())
  const edgeRailStateRef = useRef<{
    active: boolean
    lastY: number
    startMs: number
    totalAbsDy: number
    notchAccumPx: number
    scrollResidual: number
  }>({
    active: false,
    lastY: 0,
    startMs: 0,
    totalAbsDy: 0,
    notchAccumPx: 0,
    scrollResidual: 0,
  })
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const controllerRef = useRef<TrackpadController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new TrackpadController({
      onMotion: (dx, dy) => {
        getClient().sendPointerMotion(dx, dy)
      },
      onScroll: (x, y) => {
        getClient().sendPointerScroll(x, y)
      },
      onButton: (button, btnPhase, pressId) => {
        if (btnPhase === 'down') triggerHaptic('tap')
        getClient().sendPointerButton(button, btnPhase, pressId)
      },
      onSystemGesture: (gesture) => {
        if (!useMobileStore.getState().localFeel.threeFingerSystemGestures) return
        triggerHaptic('confirm')
        getClient().sendTouchpadGesture(gesture)
      },
    })
  }

  useEffect(() => {
    controllerRef.current?.setThreeFingerGesturesEnabled(threeFingerSystemGestures)
  }, [threeFingerSystemGestures])

  useEffect(() => {
    const canStreamNativeGyro = phase === 'active' && !isDemoMode
    if (!canStreamNativeGyro || pointerTab === 'trackpad') {
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', gyroSensitivity)
      setClutchHeld(false)
      return
    }
    if (airMouseFeel === 'relative') {
      setNativeGyroConfig('relative', gyroSensitivity)
      setNativeGyroClutch(false)
      setClutchHeld(false)
      return
    }
    if (laserPaused) {
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', gyroSensitivity)
    } else {
      setNativeGyroConfig('absolute', gyroSensitivity)
      setNativeGyroClutch(true)
    }
  }, [phase, isDemoMode, pointerTab, airMouseFeel, gyroSensitivity, laserPaused])

  useEffect(() => {
    const ctrl = controllerRef.current
    const manualMap = heldManualButtons.current
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      ctrl?.cancelAll()
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', 1.0)
      for (const [btn, pressId] of manualMap.entries()) {
        getClient().sendPointerButton(btn, 'up', pressId)
      }
      manualMap.clear()
    }
  }, [getClient])

  const releaseAllHeldButtons = () => {
    controllerRef.current?.cancelAll()
    setDragLocked(false)
    edgeRailStateRef.current.active = false
    for (const [btn, pressId] of heldManualButtons.current.entries()) {
      getClient().sendPointerButton(btn, 'up', pressId)
    }
    heldManualButtons.current.clear()
    setPressedButtons({})
  }

  const handleTabSelect = (next: PointerTabMode) => {
    if (next === pointerTab) return
    triggerHaptic('tap')
    releaseAllHeldButtons()
    setClutchHeld(false)
    setLaserPaused(false)
    setPointerTab(next)
  }

  const handleAirMouseFeelSelect = (nextFeel: AirMouseFeelMode) => {
    if (nextFeel === airMouseFeel) return
    triggerHaptic('tap')
    setClutchHeld(false)
    setLaserPaused(false)
    setAirMouseFeel(nextFeel)
    showHudToast(
      nextFeel === 'relative'
        ? '惯性飞鼠 · 按住下方区域挥腕移鼠'
        : '激光飞鼠 · 手机实时指向屏幕',
    )
  }

  const handleToggleHandedness = () => {
    triggerHaptic('tap')
    const nextHand = airMouseHandedness === 'right' ? 'left' : 'right'
    updateLocalFeel({
      airMouseHandedness: nextHand,
    })
    showHudToast(
      nextHand === 'left'
        ? '已切换为左手握持 · 滚轮移至左侧'
        : '已切换为右手握持 · 滚轮移至右侧',
    )
  }

  const toggleDragLock = () => {
    const next = !dragLocked
    setDragLocked(next)
    controllerRef.current?.setButton('left', next)
    triggerHaptic(next ? 'heavy' : 'tap')
    showHudToast(next ? '左键拖拽已锁定 · 滑动即可移窗' : '左键拖拽已解除')
  }

  const handlePhysicalButton = (button: PointerButtonName, down: boolean) => {
    setPressedButtons((prev) => ({ ...prev, [button]: down }))
    if (pointerTab === 'trackpad') {
      controllerRef.current?.setButton(button, down)
      return
    }
    if (down) {
      if (heldManualButtons.current.has(button)) return
      notifyNativePointerClickPulse()
      triggerHaptic('tap')
      const pressId = nextManualPressId(button)
      heldManualButtons.current.set(button, pressId)
      getClient().sendPointerButton(button, 'down', pressId)
    } else {
      const pressId = heldManualButtons.current.get(button)
      if (!pressId) return
      heldManualButtons.current.delete(button)
      getClient().sendPointerButton(button, 'up', pressId)
    }
  }

  const handleEdgeRailDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    edgeRailStateRef.current = {
      active: true,
      lastY: e.clientY,
      startMs: performance.now(),
      totalAbsDy: 0,
      notchAccumPx: 0,
      scrollResidual: 0,
    }
    setPressedButtons((p) => ({ ...p, scroll: true }))
  }

  const handleEdgeRailMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = edgeRailStateRef.current
    if (!st.active) return
    const dy = e.clientY - st.lastY
    st.lastY = e.clientY
    if (dy === 0) return

    st.totalAbsDy += Math.abs(dy)
    st.notchAccumPx += dy
    if (Math.abs(st.notchAccumPx) >= ENCODER_NOTCH_PX) {
      const steps = Math.trunc(st.notchAccumPx / ENCODER_NOTCH_PX)
      st.notchAccumPx -= steps * ENCODER_NOTCH_PX
      triggerHaptic('detent')
      setRailOffsetTick((n) => (n + steps) % 4)
    }

    st.scrollResidual += dy * 0.28
    if (Math.abs(st.scrollResidual) >= 0.3) {
      getClient().sendPointerScroll(0, st.scrollResidual)
      st.scrollResidual = 0
    }
  }

  const handleEdgeRailUp = (cancelled: boolean) => {
    const st = edgeRailStateRef.current
    if (!st.active) return
    st.active = false
    setPressedButtons((p) => ({ ...p, scroll: false }))
    if (cancelled) {
      st.scrollResidual = 0
      return
    }

    if (st.totalAbsDy > 8) {
      if (Math.abs(st.scrollResidual) >= 0.08) {
        getClient().sendPointerScroll(0, st.scrollResidual)
      }
      st.scrollResidual = 0
      return
    }

    const elapsed = performance.now() - st.startMs
    if (elapsed <= 260) {
      notifyNativePointerClickPulse()
      triggerHaptic('tap')
      const pressId = nextManualPressId('middle')
      getClient().sendPointerButton('middle', 'down', pressId)
      getClient().sendPointerButton('middle', 'up', pressId)
    }
  }

  const handleRecenter = () => {
    clearGyroGuard()
    if (pointerTab === 'airmouse' && airMouseFeel === 'laser') {
      setLaserPaused(false)
      if (phase === 'active' && !isDemoMode) {
        setNativeGyroConfig('absolute', gyroSensitivity)
        setNativeGyroClutch(true)
      }
    }
    recenterNativeCursor()
    showHudToast('光标已归中至主屏中央')
    setRecenteredFlash(true)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => {
      setRecenteredFlash(false)
      flashTimerRef.current = null
    }, 750)
  }

  const guardBannerText =
    gyroGuard?.kind === 'vertical_guard'
      ? '请稍微放平指向屏幕'
      : gyroGuard?.kind === 'out_of_bounds'
        ? '对准屏幕点按「归中」'
        : null

  return (
    <div className={clsx('flex flex-col gap-2.5 w-full h-full min-h-[210px] select-none', className)}>
      {/* Minimal Top Bar: [ 触控板 | 飞鼠 ] on left + contextual utility actions & [ 归中 ] on right */}
      <div className="shrink-0 flex items-center justify-between gap-1.5 flex-wrap">
        <div className="ak-seg inline-flex p-0.5 rounded-[16px] border">
          <button
            type="button"
            onClick={() => handleTabSelect('trackpad')}
            className={clsx(
              'h-8 px-3 rounded-[13px] text-xs font-medium transition-colors',
              pointerTab === 'trackpad' ? 'ak-elevated-alt border' : 'ak-text-2',
            )}
          >
            触控板
          </button>
          <button
            type="button"
            onClick={() => handleTabSelect('airmouse')}
            className={clsx(
              'h-8 px-3 rounded-[13px] text-xs font-medium transition-colors',
              pointerTab === 'airmouse' ? 'ak-elevated-alt border' : 'ak-text-2',
            )}
          >
            飞鼠
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {pointerTab === 'airmouse' ? (
            <>
              <div className="ak-seg inline-flex p-0.5 rounded-[14px] border">
                <button
                  type="button"
                  onClick={() => handleAirMouseFeelSelect('relative')}
                  className={clsx(
                    'h-7 px-2.5 rounded-[11px] text-[11px] font-medium transition-colors',
                    airMouseFeel === 'relative' ? 'ak-elevated-alt border' : 'ak-text-2',
                  )}
                >
                  惯性
                </button>
                <button
                  type="button"
                  onClick={() => handleAirMouseFeelSelect('laser')}
                  className={clsx(
                    'h-7 px-2.5 rounded-[11px] text-[11px] font-medium transition-colors',
                    airMouseFeel === 'laser' ? 'ak-elevated-alt border' : 'ak-text-2',
                  )}
                >
                  激光
                </button>
              </div>

              <button
                type="button"
                onClick={handleToggleHandedness}
                aria-label="切换飞鼠左右手握持"
                title={airMouseHandedness === 'left' ? '左手握持' : '右手握持'}
                className="tile-surface ak-elevated ak-text-2 h-8 w-8 rounded-[14px] border inline-flex items-center justify-center"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleDragLock}
              aria-label="拖拽锁定"
              className={clsx(
                'tile-surface h-8 w-8 rounded-[14px] border inline-flex items-center justify-center transition-colors',
                dragLocked ? 'ak-primary-solid' : 'ak-elevated ak-text-2',
              )}
            >
              {dragLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={handleRecenter}
            aria-label="屏幕归中"
            className={clsx(
              'tile-surface h-8 px-2.5 rounded-[14px] border inline-flex items-center gap-1 text-[11.5px] font-medium transition-colors',
              recenteredFlash ? 'ak-primary-solid' : 'ak-elevated ak-text-1',
            )}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{recenteredFlash ? '已归中' : '归中'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setPointerHelpOpen(true)
            }}
            aria-label="操控手势说明"
            className="tile-surface ak-elevated ak-text-2 h-8 w-8 rounded-[14px] border inline-flex items-center justify-center"
          >
            <Info className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setPointerSettingsOpen(true)
            }}
            aria-label="指针与飞鼠设置"
            className="tile-surface ak-elevated ak-text-2 h-8 w-8 rounded-[14px] border inline-flex items-center justify-center"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subtle Gyro Guard Hint */}
      {guardBannerText && pointerTab === 'airmouse' && (
        <div
          className={clsx(
            'shrink-0 px-3 py-1.5 rounded-[14px] border flex items-center gap-2 text-xs',
            isLight
              ? 'bg-amber-500/12 border-amber-500/30 text-amber-900'
              : 'bg-amber-500/15 border-amber-400/30 text-amber-200',
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{guardBannerText}</span>
        </div>
      )}

      {/* Modality 1: Pure Matte Trackpad (Zero tutorial text — ONLY 18px center crosshair reticle) */}
      {pointerTab === 'trackpad' && (
        <>
          <div
            data-testid="standalone-trackpad-surface"
            className="trackpad-dots ak-border-subtle relative flex-1 rounded-[28px] border touch-none select-none overflow-hidden flex items-center justify-center"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId)
              controllerRef.current?.onPointerDown(e.pointerId, e.clientX, e.clientY)
            }}
            onPointerMove={(e) => {
              controllerRef.current?.onPointerMove(e.pointerId, e.clientX, e.clientY)
            }}
            onPointerUp={(e) => {
              controllerRef.current?.onPointerUp(e.pointerId)
            }}
            onPointerCancel={(e) => {
              controllerRef.current?.onPointerCancel(e.pointerId)
            }}
          >
            <div className="w-[18px] h-[18px] relative opacity-20 pointer-events-none">
              <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
              <span className="absolute inset-y-0 left-1/2 w-px bg-current" />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2.5 h-[56px] shrink-0">
            <button
              type="button"
              className={clsx(
                'tile-surface ak-elevated col-span-5 rounded-[18px] border text-xs font-medium touch-none',
                pressedButtons.left && 'tile-pressed ak-elevated-alt',
              )}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId)
                handlePhysicalButton('left', true)
              }}
              onPointerUp={() => handlePhysicalButton('left', false)}
              onPointerCancel={() => handlePhysicalButton('left', false)}
            >
              左键
            </button>
            <button
              type="button"
              className={clsx(
                'tile-surface ak-well col-span-2 rounded-[18px] border text-[11px] font-medium ak-text-2 touch-none',
                pressedButtons.middle && 'tile-pressed ak-elevated',
              )}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId)
                handlePhysicalButton('middle', true)
              }}
              onPointerUp={() => handlePhysicalButton('middle', false)}
              onPointerCancel={() => handlePhysicalButton('middle', false)}
            >
              中键
            </button>
            <button
              type="button"
              className={clsx(
                'tile-surface ak-elevated col-span-5 rounded-[18px] border text-xs font-medium touch-none',
                pressedButtons.right && 'tile-pressed ak-elevated-alt',
              )}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId)
                handlePhysicalButton('right', true)
              }}
              onPointerUp={() => handlePhysicalButton('right', false)}
              onPointerCancel={() => handlePhysicalButton('right', false)}
            >
              右键
            </button>
          </div>
        </>
      )}

      {/* Modality 2: Mid-Grip Air-Mouse + Side Rotary Encoder Strip (Zero prose clutter) */}
      {pointerTab === 'airmouse' && (
        <div
          data-testid="airmouse-midgrip-layout"
          data-handedness={airMouseHandedness}
          className={clsx(
            'flex-1 min-h-0 flex gap-2.5',
            airMouseHandedness === 'left' ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          {/* Main Column: Mid-Grip Triggers (左键 | 右键) + Calm Clutch Surface */}
          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            <div
              className={clsx(
                'h-[68px] shrink-0 flex gap-2.5',
                airMouseHandedness === 'left' && 'flex-row-reverse',
              )}
            >
              <button
                type="button"
                style={{ flex: '62 1 0%' }}
                className={clsx(
                  'tile-surface ak-elevated-alt rounded-[18px] border text-xs font-semibold touch-none',
                  pressedButtons.left && 'tile-pressed ak-primary-solid',
                )}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId)
                  handlePhysicalButton('left', true)
                }}
                onPointerUp={() => handlePhysicalButton('left', false)}
                onPointerCancel={() => handlePhysicalButton('left', false)}
              >
                左键
              </button>

              <button
                type="button"
                style={{ flex: '38 1 0%' }}
                className={clsx(
                  'tile-surface ak-elevated rounded-[18px] border text-xs font-medium ak-text-2 touch-none',
                  pressedButtons.right && 'tile-pressed ak-elevated-alt ak-text-1',
                )}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId)
                  handlePhysicalButton('right', true)
                }}
                onPointerUp={() => handlePhysicalButton('right', false)}
                onPointerCancel={() => handlePhysicalButton('right', false)}
              >
                右键
              </button>
            </div>

            {airMouseFeel === 'relative' ? (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId)
                  setClutchHeld(true)
                  triggerHaptic('tap')
                  if (phase === 'active' && !isDemoMode) {
                    setNativeGyroConfig('relative', gyroSensitivity)
                    setNativeGyroClutch(true)
                  }
                }}
                onPointerUp={() => {
                  setClutchHeld(false)
                  setNativeGyroClutch(false)
                }}
                onPointerCancel={() => {
                  setClutchHeld(false)
                  setNativeGyroClutch(false)
                }}
                className={clsx(
                  'relative flex-1 min-h-[120px] rounded-[28px] border flex flex-col items-center justify-center gap-2 touch-none transition-all',
                  clutchHeld ? 'ak-clutch-engaged scale-[0.985]' : 'chassis-well',
                )}
              >
                <span
                  className={clsx(
                    'w-2 h-2 rounded-full transition-colors',
                    clutchHeld ? 'ak-live-dot' : isLight ? 'bg-black/20' : 'bg-white/20',
                  )}
                />
                <span className={clsx('text-xs font-medium', clutchHeld ? 'ak-text-1' : 'ak-text-2')}>
                  按住移鼠
                </span>
              </button>
            ) : (
              <div className="chassis-well relative flex-1 min-h-[120px] rounded-[28px] border flex flex-col items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    const nextPaused = !laserPaused
                    setLaserPaused(nextPaused)
                    showHudToast(nextPaused ? '激光追踪已暂停' : '激光追踪已恢复')
                  }}
                  aria-label={laserPaused ? '恢复追踪' : '暂停追踪'}
                  className="ak-elevated ak-text-2 absolute top-3 right-3 w-8 h-8 rounded-full border inline-flex items-center justify-center"
                >
                  {laserPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={handleRecenter}
                  className="w-full h-full rounded-[28px] flex flex-col items-center justify-center gap-2 touch-none"
                >
                  <span
                    className={clsx(
                      'w-2 h-2 rounded-full',
                      laserPaused
                        ? isLight
                          ? 'bg-black/20'
                          : 'bg-white/20'
                        : 'ak-live-dot',
                    )}
                  />
                  <span className="ak-text-2 text-xs font-medium">激光追踪</span>
                </button>
              </div>
            )}
          </div>

          {/* Sleek Side Rotary Encoder Strip (Subtle Tick Marks Only) */}
          <div
            role="button"
            tabIndex={0}
            aria-label="侧边无限滚轮条"
            data-testid="airmouse-edge-scroll"
            onPointerDown={handleEdgeRailDown}
            onPointerMove={handleEdgeRailMove}
            onPointerUp={() => handleEdgeRailUp(false)}
            onPointerCancel={() => handleEdgeRailUp(true)}
            className={clsx(
              'w-[46px] shrink-0 rounded-[28px] border flex flex-col items-center justify-center py-5 touch-none select-none transition-colors',
              pressedButtons.scroll ? 'ak-elevated-alt' : 'chassis-well',
            )}
          >
            <div className="flex-1 flex flex-col items-center justify-evenly w-full px-2">
              {ENCODER_TICKS.map((idx) => {
                const major = (idx + Math.abs(railOffsetTick)) % 3 === 0
                return (
                  <span
                    key={idx}
                    className={clsx(
                      'rounded-full transition-all duration-75',
                      major ? 'w-4 h-[1.5px]' : 'w-2.5 h-px',
                      pressedButtons.scroll
                        ? isLight
                          ? 'bg-black/55'
                          : 'bg-white/65'
                        : major
                          ? isLight
                            ? 'bg-black/30'
                            : 'bg-white/25'
                          : isLight
                            ? 'bg-black/15'
                            : 'bg-white/12',
                    )}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
