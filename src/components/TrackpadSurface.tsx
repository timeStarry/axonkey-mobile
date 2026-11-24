import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Compass,
  Crosshair,
  Hand,
  Lock,
  LockOpen,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
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
  const volumeKeyMouseMode = useMobileStore((s) => s.localFeel.volumeKeyMouseMode)
  const threeFingerSystemGestures = useMobileStore(
    (s) => s.localFeel.threeFingerSystemGestures,
  )
  const updateLocalFeel = useMobileStore((s) => s.updateLocalFeel)
  const gyroGuard = useMobileStore((s) => s.gyroGuard)
  const clearGyroGuard = useMobileStore((s) => s.clearGyroGuard)

  const isLight = effectiveTheme === 'light'

  const [dragLocked, setDragLocked] = useState(false)
  const [activeTouches, setActiveTouches] = useState(0)
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

  // Synchronize native gyro mode & clutch lifecycle cleanly
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
    // airMouseFeel === 'laser' (ray-projection absolute mapping)
    if (laserPaused) {
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', gyroSensitivity)
    } else {
      setNativeGyroConfig('absolute', gyroSensitivity)
      setNativeGyroClutch(true)
    }
  }, [phase, isDemoMode, pointerTab, airMouseFeel, gyroSensitivity, laserPaused])

  // Ensure sensors & held buttons release cleanly on unmount
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
  }

  const handleToggleHandedness = () => {
    triggerHaptic('tap')
    updateLocalFeel({
      airMouseHandedness: airMouseHandedness === 'right' ? 'left' : 'right',
    })
  }

  const toggleDragLock = () => {
    const next = !dragLocked
    setDragLocked(next)
    controllerRef.current?.setButton('left', next)
    triggerHaptic(next ? 'heavy' : 'tap')
  }

  const handlePhysicalButton = (button: PointerButtonName, down: boolean) => {
    setPressedButtons((prev) => ({ ...prev, [button]: down }))
    if (pointerTab === 'trackpad') {
      controllerRef.current?.setButton(button, down)
      return
    }
    if (down) {
      if (heldManualButtons.current.has(button)) return
      // 75ms Click-Stabilizer pulse BEFORE sending button down so thumb press never jerks aim!
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
      triggerHaptic('tap')
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

    // Quick tap on Edge Scroll Rail -> Middle Mouse Click with Click-Stabilizer!
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
    setRecenteredFlash(true)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => {
      setRecenteredFlash(false)
      flashTimerRef.current = null
    }, 750)
  }

  const primaryTabs: { id: PointerTabMode; icon: typeof MousePointer2; label: string }[] = [
    { id: 'trackpad', icon: MousePointer2, label: '触控板' },
    { id: 'airmouse', icon: Compass, label: '体感飞鼠' },
  ]

  const guardBannerText =
    gyroGuard?.kind === 'vertical_guard'
      ? '手机接近竖直奇异区，请稍微放平指向屏幕'
      : gyroGuard?.kind === 'out_of_bounds'
        ? '视线偏出屏幕范围 · 请对准屏幕中心点按「屏幕归中」'
        : null

  const volumeModeBadge =
    volumeKeyMouseMode === 'lr'
      ? '音量键左/右'
      : volumeKeyMouseMode === 'rl'
        ? '音量键右/左'
        : volumeKeyMouseMode === 'scroll'
          ? '音量键滚轮'
          : null

  return (
    <div className={clsx('flex flex-col gap-2.5 w-full h-full min-h-[210px] select-none', className)}>
      {/* Clean 2-Tab Modality Switcher: Touchpad | Air-Mouse */}
      <div className="ak-seg shrink-0 grid grid-cols-2 gap-1.5 p-1.5 rounded-[20px] border">
        {primaryTabs.map((item) => {
          const Icon = item.icon
          const active = pointerTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabSelect(item.id)}
              className={clsx(
                'h-10 rounded-xl inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold transition-all touch-none',
                active
                  ? clsx(
                      'tile-surface ak-active-tab border shadow-xs',
                      isLight ? 'border-blue-500/35' : 'border-white/[0.12]',
                    )
                  : 'ak-text-2',
              )}
            >
              <Icon
                className={clsx(
                  'w-4 h-4',
                  active ? (isLight ? 'text-blue-600' : 'text-blue-400') : 'ak-text-3',
                )}
              />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* Gyro Guard Hint Toast */}
      {guardBannerText && pointerTab === 'airmouse' && (
        <div
          className={clsx(
            'shrink-0 px-3 py-2 rounded-xl border flex items-center gap-2 text-[11.5px]',
            isLight
              ? 'bg-amber-500/15 border-amber-500/35 text-amber-900'
              : 'bg-amber-500/15 border-amber-400/35 text-amber-200',
          )}
        >
          <AlertTriangle
            className={clsx('w-4 h-4 shrink-0', isLight ? 'text-amber-600' : 'text-amber-400')}
          />
          <span className="leading-snug">{guardBannerText}</span>
        </div>
      )}

      {/* Modality 1: Silky Multi-Touch Trackpad + 3-Finger System Gestures + Instant Recenter */}
      {pointerTab === 'trackpad' && (
        <>
          <div
            data-testid="standalone-trackpad-surface"
            className="trackpad-dots ak-border relative flex-1 rounded-[24px] border touch-none select-none overflow-hidden"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId)
              setActiveTouches((n) => n + 1)
              controllerRef.current?.onPointerDown(e.pointerId, e.clientX, e.clientY)
            }}
            onPointerMove={(e) => {
              controllerRef.current?.onPointerMove(e.pointerId, e.clientX, e.clientY)
            }}
            onPointerUp={(e) => {
              setActiveTouches((n) => Math.max(0, n - 1))
              controllerRef.current?.onPointerUp(e.pointerId)
            }}
            onPointerCancel={(e) => {
              setActiveTouches((n) => Math.max(0, n - 1))
              controllerRef.current?.onPointerCancel(e.pointerId)
            }}
          >
            {/* Subtle precision corner reticles */}
            <div
              className={clsx(
                'pointer-events-none absolute inset-3.5 border rounded-xl',
                isLight ? 'border-slate-900/[0.04]' : 'border-white/[0.03]',
              )}
            />

            {/* Top-left 1-Tap Cursor Recenter Utility Pill */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleRecenter}
              aria-label="屏幕归中"
              className={clsx(
                'absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all active:scale-95',
                recenteredFlash
                  ? isLight
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-200'
                  : 'ak-elevated ak-text-2 opacity-95',
              )}
            >
              <Crosshair className="w-3 h-3" />
              <span>{recenteredFlash ? '已归中' : '归中'}</span>
            </button>

            {/* Top-right Drag Lock Pill */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleDragLock}
              aria-label="拖拽锁定"
              className={clsx(
                'absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors',
                dragLocked
                  ? isLight
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-blue-500/25 border-blue-400/55 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                  : 'ak-elevated ak-text-2 opacity-95',
              )}
            >
              {dragLocked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
              <span>拖拽锁</span>
            </button>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
              <span className="ak-text-2 text-xs font-medium tracking-wide">
                {activeTouches >= 3 && threeFingerSystemGestures
                  ? '三指系统手势 · 上滑任务视图 · 下滑桌面 · 左右切桌面'
                  : activeTouches >= 2
                    ? '双指平滑滚动 · 轻点触发右键'
                    : dragLocked
                      ? '左键拖拽已锁定 · 滑动拖移窗口'
                      : '单指丝滑移动 · 轻点左键 · 双击滑动拖拽'}
              </span>
              <span className="ak-text-3 text-[10.5px]">
                {threeFingerSystemGestures
                  ? '双指滚轮/右键 · 三指滑动系统任务视图 · 三指轻点中键'
                  : '双指轻点右键 · 双指上下滚动 · 找不到鼠标点左上「归中」'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2.5 h-[62px] shrink-0">
            <button
              type="button"
              className={clsx(
                'tile-surface ak-elevated col-span-5 rounded-[20px] border text-[13.5px] font-semibold touch-none',
                pressedButtons.left && 'tile-pressed border-blue-500/55',
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
                'tile-surface ak-elevated-alt col-span-2 rounded-[20px] border text-xs font-medium touch-none',
                pressedButtons.middle && 'tile-pressed border-blue-500/50',
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
                'tile-surface ak-elevated col-span-5 rounded-[20px] border text-[13.5px] font-semibold touch-none',
                pressedButtons.right && 'tile-pressed border-blue-500/55',
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

      {/* Modality 2: Ergonomic Mid-Grip Air-Mouse + Edge Infinite Scroll Strip + Click Stabilizer */}
      {pointerTab === 'airmouse' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {/* Air-Mouse Top Bar: [ 惯性飞鼠 | 激光指哪 ] + [ 右手/左手 ] + Volume Badge + [ 屏幕归中 ] */}
          <div className="shrink-0 flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="ak-seg inline-flex items-center p-1 rounded-2xl border">
                <button
                  type="button"
                  onClick={() => handleAirMouseFeelSelect('relative')}
                  className={clsx(
                    'h-8 px-2.5 rounded-xl text-xs font-semibold transition-all',
                    airMouseFeel === 'relative'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'ak-text-2',
                  )}
                >
                  惯性飞鼠
                </button>
                <button
                  type="button"
                  onClick={() => handleAirMouseFeelSelect('laser')}
                  className={clsx(
                    'h-8 px-2.5 rounded-xl text-xs font-semibold transition-all',
                    airMouseFeel === 'laser'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'ak-text-2',
                  )}
                >
                  激光指哪
                </button>
              </div>

              <button
                type="button"
                onClick={handleToggleHandedness}
                aria-label="切换飞鼠左右手握持"
                className="tile-surface ak-elevated ak-text-2 h-9 px-2.5 rounded-xl border inline-flex items-center gap-1 text-[11.5px] font-semibold"
              >
                <ArrowLeftRight className="w-3 h-3 ak-text-3" />
                <span>{airMouseHandedness === 'left' ? '左手' : '右手'}</span>
              </button>

              {volumeModeBadge && (
                <span
                  className={clsx(
                    'px-2 py-1 rounded-full border text-[10.5px] font-semibold inline-flex items-center gap-1',
                    isLight
                      ? 'bg-emerald-600/10 border-emerald-600/30 text-emerald-800'
                      : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200',
                  )}
                >
                  <Volume2 className="w-3 h-3" />
                  <span>{volumeModeBadge}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleRecenter}
              aria-label="屏幕归中"
              className={clsx(
                'tile-surface h-9 px-3 rounded-2xl border inline-flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95',
                recenteredFlash
                  ? isLight
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-100'
                  : isLight
                    ? 'bg-white border-blue-500/35 text-blue-700'
                    : 'bg-[#172236] border-blue-400/40 text-blue-200',
              )}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{recenteredFlash ? '已归中主屏' : '屏幕归中'}</span>
            </button>
          </div>

          {/* Mid-Grip Split Layout: Main Ergonomic Column + Thumb-Edge Infinite Scroll Rail */}
          <div
            data-testid="airmouse-midgrip-layout"
            data-handedness={airMouseHandedness}
            className={clsx(
              'flex-1 min-h-0 flex gap-2',
              airMouseHandedness === 'left' ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            {/* Main Ergonomic Column: Upper Mid-Grip Triggers (65% Left / 35% Right) + Lower Clutch/Laser */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div
                className={clsx(
                  'h-[74px] shrink-0 flex gap-2',
                  airMouseHandedness === 'left' && 'flex-row-reverse',
                )}
              >
                <button
                  type="button"
                  style={{ flex: '65 1 0%' }}
                  className={clsx(
                    'tile-surface ak-elevated rounded-[22px] border flex flex-col items-center justify-center gap-0.5 touch-none',
                    pressedButtons.left
                      ? 'tile-pressed border-blue-500/65'
                      : isLight
                        ? 'border-blue-500/25'
                        : 'border-blue-400/25',
                  )}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture?.(e.pointerId)
                    handlePhysicalButton('left', true)
                  }}
                  onPointerUp={() => handlePhysicalButton('left', false)}
                  onPointerCancel={() => handlePhysicalButton('left', false)}
                >
                  <span className="ak-text-1 text-[15px] font-bold tracking-wide">左键</span>
                  <span className="ak-text-3 text-[10px] font-medium">主触发 · 防抖稳瞄</span>
                </button>

                <button
                  type="button"
                  style={{ flex: '35 1 0%' }}
                  className={clsx(
                    'tile-surface ak-elevated-alt rounded-[22px] border flex flex-col items-center justify-center gap-0.5 touch-none',
                    pressedButtons.right && 'tile-pressed border-blue-500/65',
                  )}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture?.(e.pointerId)
                    handlePhysicalButton('right', true)
                  }}
                  onPointerUp={() => handlePhysicalButton('right', false)}
                  onPointerCancel={() => handlePhysicalButton('right', false)}
                >
                  <span className="ak-text-1 text-[13.5px] font-semibold">右键</span>
                  <span className="ak-text-3 text-[9.5px]">菜单</span>
                </button>
              </div>

              {/* Lower-Center Clutch / Laser Calibration Pad */}
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
                    'relative flex-1 min-h-[120px] rounded-[26px] border flex flex-col items-center justify-center gap-2.5 px-5 text-center touch-none transition-all overflow-hidden',
                    clutchHeld ? 'ak-clutch-engaged scale-[0.985]' : 'chassis-well',
                  )}
                >
                  <div
                    className={clsx(
                      'w-13 h-13 rounded-full border flex items-center justify-center transition-all',
                      clutchHeld
                        ? isLight
                          ? 'bg-blue-600 text-white border-blue-600 shadow-[0_6px_20px_rgba(37,99,235,0.35)] scale-105'
                          : 'bg-blue-500/25 border-blue-400 text-blue-200 shadow-[0_0_24px_rgba(59,130,246,0.45)] scale-105'
                        : 'ak-elevated ak-text-2',
                    )}
                  >
                    <Hand className="w-5 h-5" />
                  </div>

                  <div className="space-y-1">
                    <div className="ak-text-1 text-[14.5px] font-bold tracking-wide">
                      {clutchHeld ? '飞鼠离合已啮合 · 转动手腕移动光标' : '按住飞鼠移动（离合键）'}
                    </div>
                    <div className="ak-text-2 text-[11.5px] leading-relaxed">
                      {clutchHeld
                        ? '重力对齐消滚转 · 松开手指立即停稳'
                        : '中握拇指自然落位 · 上按左键稳瞄不跳 · 侧滑滚轮顺滑翻页'}
                    </div>
                  </div>

                  <span className="ak-pill ak-text-2 px-2.5 py-0.5 rounded-full border text-[10.5px] font-mono">
                    灵敏度 {gyroSensitivity.toFixed(1)}×
                  </span>
                </button>
              ) : (
                <div className="chassis-well relative flex-1 min-h-[120px] rounded-[26px] border p-3 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="ak-pill inline-flex items-center gap-2 px-2.5 py-1 rounded-full border">
                      <span
                        className={clsx(
                          'w-2 h-2 rounded-full',
                          laserPaused
                            ? 'bg-zinc-400'
                            : gyroGuard
                              ? 'bg-amber-500 animate-pulse'
                              : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]',
                        )}
                      />
                      <span className="ak-text-1 text-[11px] font-semibold">
                        {laserPaused
                          ? '激光追踪已暂停'
                          : recenteredFlash
                            ? '中心射线已校准'
                            : '激光指哪实时追踪中'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap')
                        setLaserPaused((p) => !p)
                      }}
                      className={clsx(
                        'h-7 px-2.5 rounded-full inline-flex items-center gap-1 text-[11px] font-semibold border transition-colors',
                        laserPaused
                          ? isLight
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                          : 'ak-elevated ak-text-2',
                      )}
                    >
                      {laserPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      <span>{laserPaused ? '恢复追踪' : '暂停追踪'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleRecenter}
                    className={clsx(
                      'tile-surface flex-1 min-h-[96px] rounded-2xl border flex flex-col items-center justify-center gap-1.5 px-3 text-center active:scale-[0.97] transition-all',
                      recenteredFlash
                        ? isLight
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100'
                        : isLight
                          ? 'bg-gradient-to-b from-white to-[#eef5ff] border-blue-500/35 text-slate-900'
                          : 'bg-gradient-to-b from-[#20304f] to-[#152036] border-blue-400/40 text-white shadow-[0_0_24px_rgba(59,130,246,0.18)]',
                    )}
                  >
                    <span
                      className={clsx(
                        'w-9 h-9 rounded-2xl border inline-flex items-center justify-center',
                        recenteredFlash
                          ? 'bg-white/20 border-white/35 text-white'
                          : isLight
                            ? 'bg-blue-600/12 border-blue-500/25 text-blue-600'
                            : 'bg-blue-400/20 border-blue-300/25 text-blue-200',
                      )}
                    >
                      <RotateCcw className="w-4.5 h-4.5" />
                    </span>
                    <div>
                      <div className="text-[13.5px] font-bold tracking-wide">
                        对准屏幕正中央 · 点击校准归中
                      </div>
                      <div
                        className={clsx(
                          'text-[10.5px] mt-0.5',
                          recenteredFlash
                            ? 'opacity-90'
                            : isLight
                              ? 'text-slate-600'
                              : 'text-blue-200/75',
                        )}
                      >
                        将手机顶部对准主屏中心，实现激光笔式指哪打哪
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Edge Infinite Scroll Rail (w-[50px] vertical encoder strip on thumb edge) */}
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
                'w-[50px] shrink-0 rounded-[24px] border flex flex-col items-center justify-between py-3 touch-none select-none transition-colors',
                pressedButtons.scroll
                  ? isLight
                    ? 'bg-blue-600/12 border-blue-500/55 shadow-inner'
                    : 'bg-blue-500/20 border-blue-400/60 shadow-inner'
                  : 'chassis-well',
              )}
            >
              <span className="ak-text-3 text-[9.5px] font-semibold tracking-tight">滚轮</span>

              {/* Visual Rotary Encoder Tick Marks */}
              <div className="flex-1 flex flex-col items-center justify-evenly w-full px-2 py-2">
                {ENCODER_TICKS.map((idx) => {
                  const major = (idx + Math.abs(railOffsetTick)) % 3 === 0
                  return (
                    <span
                      key={idx}
                      className={clsx(
                        'rounded-full transition-all duration-75',
                        major ? 'w-5 h-[2px]' : 'w-3 h-[1.5px]',
                        pressedButtons.scroll
                          ? major
                            ? isLight
                              ? 'bg-blue-600'
                              : 'bg-blue-300'
                            : isLight
                              ? 'bg-blue-500/50'
                              : 'bg-blue-400/45'
                          : major
                            ? isLight
                              ? 'bg-slate-500/55'
                              : 'bg-white/30'
                            : isLight
                              ? 'bg-slate-400/35'
                              : 'bg-white/12',
                      )}
                    />
                  )
                })}
              </div>

              <span className="ak-text-3 text-[9px] font-medium">点中键</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
