import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Compass,
  Crosshair,
  Hand,
  Lock,
  LockOpen,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
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
  recenterNativeCursor,
  setNativeGyroClutch,
  setNativeGyroConfig,
  triggerHaptic,
} from '../transport/nativeBridge'

interface TrackpadSurfaceProps {
  className?: string
}

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
  const gyroGuard = useMobileStore((s) => s.gyroGuard)
  const clearGyroGuard = useMobileStore((s) => s.clearGyroGuard)

  const isLight = effectiveTheme === 'light'

  const [dragLocked, setDragLocked] = useState(false)
  const [activeTouches, setActiveTouches] = useState(0)
  const [clutchHeld, setClutchHeld] = useState(false)
  const [laserPaused, setLaserPaused] = useState(false)
  const [recenteredFlash, setRecenteredFlash] = useState(false)
  const [pressedButtons, setPressedButtons] = useState<Record<string, boolean>>({})

  const heldManualButtons = useRef<Map<PointerButtonName, string>>(new Map())
  const scrollClutchYRef = useRef<number | null>(null)
  const scrollResidualRef = useRef<number>(0)
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
    })
  }

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

      {/* Modality 1: Silky Multi-Touch Trackpad + Instant Screen Recenter Utility */}
      {pointerTab === 'trackpad' && (
        <>
          <div
            className="trackpad-dots ak-border relative flex-1 rounded-[24px] border touch-none select-none overflow-hidden"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
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
                {activeTouches >= 2
                  ? '双指平滑滚动 · 轻点触发右键'
                  : dragLocked
                    ? '左键拖拽已锁定 · 滑动拖移窗口'
                    : '单指丝滑移动 · 轻点左键 · 双击滑动拖拽'}
              </span>
              <span className="ak-text-3 text-[10.5px]">
                双指轻点右键 · 双指上下滚动 · 找不到鼠标点左上「归中」
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
                e.currentTarget.setPointerCapture(e.pointerId)
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
                e.currentTarget.setPointerCapture(e.pointerId)
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
                e.currentTarget.setPointerCapture(e.pointerId)
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

      {/* Modality 2: Unified Air-Mouse (Inertia Clutch + Laser Aim + 1-Tap Screen Recenter) */}
      {pointerTab === 'airmouse' && (
        <>
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            {/* Air-Mouse Utility Bar: Tracking Feel Switch + 1-Tap Screen Recenter */}
            <div className="shrink-0 flex items-center justify-between gap-2">
              <div className="ak-seg inline-flex items-center p-1 rounded-2xl border">
                <button
                  type="button"
                  onClick={() => handleAirMouseFeelSelect('relative')}
                  className={clsx(
                    'h-8 px-3 rounded-xl text-xs font-semibold transition-all',
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
                    'h-8 px-3 rounded-xl text-xs font-semibold transition-all',
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
                onClick={handleRecenter}
                aria-label="屏幕归中"
                className={clsx(
                  'tile-surface h-10 px-3.5 rounded-2xl border inline-flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95',
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

            {/* Sub-Feel A: Gravity-Aligned Relative Air-Mouse + Hold Clutch */}
            {airMouseFeel === 'relative' ? (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
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
                  'relative flex-1 rounded-[26px] border flex flex-col items-center justify-center gap-3 px-6 text-center touch-none transition-all overflow-hidden',
                  clutchHeld ? 'ak-clutch-engaged scale-[0.985]' : 'chassis-well',
                )}
              >
                <div
                  className={clsx(
                    'w-15 h-15 rounded-full border flex items-center justify-center transition-all',
                    clutchHeld
                      ? isLight
                        ? 'bg-blue-600 text-white border-blue-600 shadow-[0_6px_20px_rgba(37,99,235,0.35)] scale-105'
                        : 'bg-blue-500/25 border-blue-400 text-blue-200 shadow-[0_0_24px_rgba(59,130,246,0.45)] scale-105'
                      : 'ak-elevated ak-text-2',
                  )}
                >
                  <Hand className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <div className="ak-text-1 text-[15px] font-bold tracking-wide">
                    {clutchHeld ? '飞鼠离合已啮合 · 转动手腕移动光标' : '按住飞鼠移动（离合键）'}
                  </div>
                  <div className="ak-text-2 text-xs leading-relaxed">
                    {clutchHeld
                      ? '重力对齐消滚转 · 松开手指立即停稳'
                      : '按住挥腕即动，松手零漂移停稳 · 偏出多屏可点右上「屏幕归中」'}
                  </div>
                </div>

                <span className="ak-pill ak-text-2 px-2.5 py-0.5 rounded-full border text-[10.5px] font-mono">
                  灵敏度 {gyroSensitivity.toFixed(1)}×
                </span>
              </button>
            ) : (
              /* Sub-Feel B: Laser Ray-Projection ("指哪打哪") */
              <div className="chassis-well relative flex-1 rounded-[26px] border p-3.5 flex flex-col justify-between gap-2.5">
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
                    'tile-surface flex-1 min-h-[104px] rounded-2xl border flex flex-col items-center justify-center gap-2 px-4 text-center active:scale-[0.97] transition-all',
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
                      'w-10 h-10 rounded-2xl border inline-flex items-center justify-center',
                      recenteredFlash
                        ? 'bg-white/20 border-white/35 text-white'
                        : isLight
                          ? 'bg-blue-600/12 border-blue-500/25 text-blue-600'
                          : 'bg-blue-400/20 border-blue-300/25 text-blue-200',
                    )}
                  >
                    <RotateCcw className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="text-sm font-bold tracking-wide">
                      对准屏幕正中央 · 点击校准归中
                    </div>
                    <div
                      className={clsx(
                        'text-[11px] mt-0.5',
                        recenteredFlash
                          ? 'opacity-90'
                          : isLight
                            ? 'text-slate-600'
                            : 'text-blue-200/75',
                      )}
                    >
                      将手机顶部像电视遥控器对准主屏中心，实现激光笔式指哪打哪
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Unified Air-Mouse Paddles: Left | Hold-Scroll | Right */}
          <div className="grid grid-cols-12 gap-2.5 h-[62px] shrink-0">
            <button
              type="button"
              className={clsx(
                'tile-surface ak-elevated col-span-4 rounded-[20px] border text-[13.5px] font-semibold touch-none',
                pressedButtons.left && 'tile-pressed border-blue-500/55',
              )}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                handlePhysicalButton('left', true)
              }}
              onPointerUp={() => handlePhysicalButton('left', false)}
              onPointerCancel={() => handlePhysicalButton('left', false)}
            >
              左键
            </button>

            <div
              role="button"
              tabIndex={0}
              aria-label="上下滑动滚轮"
              className={clsx(
                'tile-surface ak-elevated-alt col-span-4 rounded-[20px] border flex items-center justify-center text-xs font-semibold touch-none',
                pressedButtons.scroll &&
                  clsx(
                    'tile-pressed border-blue-500/55',
                    isLight ? 'text-blue-700' : 'text-blue-200',
                  ),
              )}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                scrollClutchYRef.current = e.clientY
                scrollResidualRef.current = 0
                setPressedButtons((p) => ({ ...p, scroll: true }))
                triggerHaptic('tap')
              }}
              onPointerMove={(e) => {
                if (scrollClutchYRef.current === null) return
                const dy = e.clientY - scrollClutchYRef.current
                scrollClutchYRef.current = e.clientY
                scrollResidualRef.current += dy * 0.25
                if (Math.abs(scrollResidualRef.current) >= 0.35) {
                  getClient().sendPointerScroll(0, scrollResidualRef.current)
                  scrollResidualRef.current = 0
                }
              }}
              onPointerUp={() => {
                scrollClutchYRef.current = null
                scrollResidualRef.current = 0
                setPressedButtons((p) => ({ ...p, scroll: false }))
              }}
              onPointerCancel={() => {
                scrollClutchYRef.current = null
                scrollResidualRef.current = 0
                setPressedButtons((p) => ({ ...p, scroll: false }))
              }}
            >
              按住滚轮
            </div>

            <button
              type="button"
              className={clsx(
                'tile-surface ak-elevated col-span-4 rounded-[20px] border text-[13.5px] font-semibold touch-none',
                pressedButtons.right && 'tile-pressed border-blue-500/55',
              )}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
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
    </div>
  )
}
