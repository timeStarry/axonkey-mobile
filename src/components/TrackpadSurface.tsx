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
import { useMobileStore, type PointerSubMode } from '../state/useMobileStore'
import {
  recenterNativeGyro,
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
  const subMode = useMobileStore((s) => s.pointerSubMode)
  const setSubMode = useMobileStore((s) => s.setPointerSubMode)
  const gyroSensitivity = useMobileStore((s) => s.localFeel.gyroSensitivity)
  const gyroGuard = useMobileStore((s) => s.gyroGuard)
  const clearGyroGuard = useMobileStore((s) => s.clearGyroGuard)

  const [dragLocked, setDragLocked] = useState(false)
  const [activeTouches, setActiveTouches] = useState(0)
  const [clutchHeld, setClutchHeld] = useState(false)
  const [aimPaused, setAimPaused] = useState(false)
  const [recenteredFlash, setRecenteredFlash] = useState(false)
  const [pressedButtons, setPressedButtons] = useState<Record<string, boolean>>({})

  const heldManualButtons = useRef<Map<PointerButtonName, string>>(new Map())
  const scrollClutchYRef = useRef<number | null>(null)
  const scrollResidualRef = useRef<number>(0)

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
    if (!canStreamNativeGyro || subMode === 'trackpad') {
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', gyroSensitivity)
      setClutchHeld(false)
      return
    }
    if (subMode === 'relative') {
      setNativeGyroConfig('relative', gyroSensitivity)
      setNativeGyroClutch(false)
      setClutchHeld(false)
      return
    }
    if (subMode === 'absolute') {
      if (aimPaused) {
        setNativeGyroClutch(false)
        setNativeGyroConfig('off', gyroSensitivity)
      } else {
        setNativeGyroConfig('absolute', gyroSensitivity)
        setNativeGyroClutch(true)
      }
    }
  }, [phase, isDemoMode, subMode, gyroSensitivity, aimPaused])

  // Ensure sensors & held buttons release cleanly on unmount
  useEffect(() => {
    const ctrl = controllerRef.current
    const manualMap = heldManualButtons.current
    return () => {
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

  const handleSubModeSelect = (next: PointerSubMode) => {
    if (next === subMode) return
    triggerHaptic('tap')
    releaseAllHeldButtons()
    setClutchHeld(false)
    setAimPaused(false)
    setSubMode(next)
  }

  const toggleDragLock = () => {
    const next = !dragLocked
    setDragLocked(next)
    controllerRef.current?.setButton('left', next)
    triggerHaptic(next ? 'heavy' : 'tap')
  }

  const handlePhysicalButton = (button: PointerButtonName, down: boolean) => {
    setPressedButtons((prev) => ({ ...prev, [button]: down }))
    if (subMode === 'trackpad') {
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
    setAimPaused(false)
    if (phase === 'active' && !isDemoMode) {
      setNativeGyroConfig('absolute', gyroSensitivity)
      setNativeGyroClutch(true)
    }
    recenterNativeGyro()
    setRecenteredFlash(true)
    setTimeout(() => setRecenteredFlash(false), 750)
  }

  const subModes: { id: PointerSubMode; icon: typeof MousePointer2; label: string }[] = [
    { id: 'trackpad', icon: MousePointer2, label: '触控板' },
    { id: 'relative', icon: Compass, label: '体感空鼠' },
    { id: 'absolute', icon: Crosshair, label: '归中瞄准' },
  ]

  const guardBannerText =
    gyroGuard?.kind === 'vertical_guard'
      ? '手机接近竖直奇异区，请稍微放平指向屏幕'
      : gyroGuard?.kind === 'out_of_bounds'
        ? '视线偏出屏幕校准范围 · 请对准屏幕中心点击「一键归中」'
        : null

  return (
    <div className={clsx('flex flex-col gap-2.5 w-full h-full min-h-[210px] select-none', className)}>
      {/* Top Sub-Mode Segmented Pill Bar */}
      <div className="shrink-0 grid grid-cols-3 gap-1.5 p-1.5 rounded-[20px] bg-[#11151e] border border-white/[0.08]">
        {subModes.map((item) => {
          const Icon = item.icon
          const active = subMode === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSubModeSelect(item.id)}
              className={clsx(
                'h-10 rounded-xl inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold transition-all touch-none',
                active
                  ? 'bg-[#202737] text-white border border-white/[0.12] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              <Icon className={clsx('w-4 h-4', active ? 'text-blue-400' : 'text-zinc-500')} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* Gyro Guard Hint Toast */}
      {guardBannerText && subMode !== 'trackpad' && (
        <div className="shrink-0 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center gap-2 text-[11.5px] text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="leading-snug">{guardBannerText}</span>
        </div>
      )}

      {/* Mode 1: Silky Multi-Touch Trackpad */}
      {subMode === 'trackpad' && (
        <>
          <div
            className="trackpad-dots relative flex-1 rounded-[24px] border border-white/[0.09] touch-none select-none overflow-hidden"
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
            <div className="pointer-events-none absolute inset-3.5 border border-white/[0.03] rounded-xl" />

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
              <span className="text-xs font-medium tracking-wide text-zinc-400/85">
                {activeTouches >= 2
                  ? '双指平滑滚动 · 轻点触发右键'
                  : dragLocked
                    ? '左键拖拽已锁定 · 滑动拖移窗口'
                    : '单指丝滑移动 · 轻点左键 · 双击滑动拖拽'}
              </span>
              <span className="text-[10.5px] text-zinc-500/80">双指轻点右键 · 双指上下滚动</span>
            </div>

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleDragLock}
              aria-label="拖拽锁定"
              className={clsx(
                'absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                dragLocked
                  ? 'bg-blue-500/25 border-blue-400/55 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                  : 'bg-[#171c27]/90 border-white/[0.09] text-zinc-400',
              )}
            >
              {dragLocked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
              <span>拖拽锁</span>
            </button>
          </div>

          <div className="grid grid-cols-12 gap-2.5 h-[62px] shrink-0">
            <button
              type="button"
              className={clsx(
                'tile-surface col-span-5 rounded-[20px] border border-white/[0.1] bg-[#161a24] text-[13.5px] font-semibold text-zinc-100 touch-none',
                pressedButtons.left && 'tile-pressed border-blue-400/50',
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
                'tile-surface col-span-2 rounded-[20px] border border-white/[0.09] bg-[#141821] text-xs font-medium text-zinc-400 touch-none',
                pressedButtons.middle && 'tile-pressed border-blue-400/45',
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
                'tile-surface col-span-5 rounded-[20px] border border-white/[0.1] bg-[#161a24] text-[13.5px] font-semibold text-zinc-100 touch-none',
                pressedButtons.right && 'tile-pressed border-blue-400/50',
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

      {/* Mode 2: Gravity-Aligned Relative Air-Mouse + Hold Clutch */}
      {subMode === 'relative' && (
        <>
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
              clutchHeld
                ? 'bg-gradient-to-b from-[#162742] to-[#101a2c] border-blue-400/60 shadow-[inset_0_0_32px_rgba(59,130,246,0.22)] scale-[0.985]'
                : 'chassis-well border-white/[0.09]',
            )}
          >
            <div
              className={clsx(
                'w-16 h-16 rounded-full border flex items-center justify-center transition-all',
                clutchHeld
                  ? 'bg-blue-500/25 border-blue-400 text-blue-200 shadow-[0_0_24px_rgba(59,130,246,0.45)] scale-105'
                  : 'bg-white/[0.05] border-white/[0.1] text-zinc-300',
              )}
            >
              <Hand className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <div className="text-[15px] font-bold tracking-wide text-zinc-100">
                {clutchHeld ? '体感离合已啮合 · 转动手腕移动光标' : '按住体感移动（离合键）'}
              </div>
              <div className="text-xs text-zinc-400 leading-relaxed">
                {clutchHeld
                  ? '重力对齐消滚转 · 松开手指立即停稳'
                  : '按住时挥动手机控制鼠标，松开即停 · 零漂移不累手'}
              </div>
            </div>

            <span className="px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.07] text-[10.5px] font-mono text-zinc-400">
              灵敏度 {gyroSensitivity.toFixed(1)}×
            </span>
          </button>

          {/* Left | Scroll-Drag Clutch | Right */}
          <div className="grid grid-cols-12 gap-2.5 h-[62px] shrink-0">
            <button
              type="button"
              className={clsx(
                'tile-surface col-span-4 rounded-[20px] border border-white/[0.1] bg-[#161a24] text-[13.5px] font-semibold text-zinc-100 touch-none',
                pressedButtons.left && 'tile-pressed border-blue-400/50',
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
                'tile-surface col-span-4 rounded-[20px] border border-white/[0.1] bg-[#141923] flex items-center justify-center text-xs font-semibold text-zinc-300 touch-none',
                pressedButtons.scroll && 'tile-pressed border-blue-400/50 text-blue-200',
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
                'tile-surface col-span-4 rounded-[20px] border border-white/[0.1] bg-[#161a24] text-[13.5px] font-semibold text-zinc-100 touch-none',
                pressedButtons.right && 'tile-pressed border-blue-400/50',
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

      {/* Mode 3: Recentered Ray-Projection Absolute Aim */}
      {subMode === 'absolute' && (
        <>
          <div className="chassis-well relative flex-1 rounded-[26px] border border-white/[0.09] p-4 flex flex-col justify-between gap-3">
            {/* Live Tracking Status Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08]">
                <span
                  className={clsx(
                    'w-2 h-2 rounded-full',
                    aimPaused
                      ? 'bg-zinc-500'
                      : gyroGuard
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
                  )}
                />
                <span className="text-[11px] font-medium text-zinc-200">
                  {aimPaused
                    ? '射线追踪已暂停'
                    : recenteredFlash
                      ? '已校准中心基准'
                      : '射线透视投影追踪中'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  setAimPaused((p) => !p)
                }}
                className={clsx(
                  'h-7 px-2.5 rounded-full inline-flex items-center gap-1 text-[11px] font-medium border transition-colors',
                  aimPaused
                    ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                    : 'bg-white/[0.05] border-white/[0.09] text-zinc-300',
                )}
              >
                {aimPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                <span>{aimPaused ? '恢复追踪' : '暂停追踪'}</span>
              </button>
            </div>

            {/* Prominent One-Tap Recenter Button */}
            <button
              type="button"
              onClick={handleRecenter}
              className={clsx(
                'tile-surface flex-1 min-h-[110px] rounded-2xl border flex flex-col items-center justify-center gap-2 px-4 text-center active:scale-[0.97] transition-all',
                recenteredFlash
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100'
                  : 'bg-gradient-to-b from-[#20304f] to-[#152036] border-blue-400/40 text-white shadow-[0_0_24px_rgba(59,130,246,0.18)]',
              )}
            >
              <span className="w-11 h-11 rounded-2xl bg-blue-400/20 border border-blue-300/25 inline-flex items-center justify-center text-blue-200">
                <RotateCcw className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-bold tracking-wide">指向屏幕中心 · 一键归中</div>
                <div className="text-[11px] text-blue-200/75 mt-0.5">
                  将手机顶部对准主显示器正中央后点按校准
                </div>
              </div>
            </button>
          </div>

          <div className="grid grid-cols-12 gap-2.5 h-[62px] shrink-0">
            <button
              type="button"
              className={clsx(
                'tile-surface col-span-5 rounded-[20px] border border-white/[0.1] bg-[#161a24] text-[13.5px] font-semibold text-zinc-100 touch-none',
                pressedButtons.left && 'tile-pressed border-blue-400/50',
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
                'tile-surface col-span-2 rounded-[20px] border border-white/[0.09] bg-[#141821] text-xs font-medium text-zinc-400 touch-none',
                pressedButtons.middle && 'tile-pressed border-blue-400/45',
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
                'tile-surface col-span-5 rounded-[20px] border border-white/[0.1] bg-[#161a24] text-[13.5px] font-semibold text-zinc-100 touch-none',
                pressedButtons.right && 'tile-pressed border-blue-400/50',
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
