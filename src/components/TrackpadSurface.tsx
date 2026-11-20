import { useEffect, useRef, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { clsx } from 'clsx'
import { TrackpadController } from '../input/trackpad'
import { useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'

interface TrackpadSurfaceProps {
  className?: string
}

export function TrackpadSurface({ className }: TrackpadSurfaceProps) {
  const getClient = useMobileStore((s) => s.getClient)
  const [dragLocked, setDragLocked] = useState(false)
  const [activeTouches, setActiveTouches] = useState(0)

  const controllerRef = useRef<TrackpadController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new TrackpadController({
      onMotion: (dx, dy) => {
        getClient().sendPointerMotion(dx, dy)
      },
      onScroll: (x, y) => {
        getClient().sendPointerScroll(x, y)
      },
      onButton: (button, phase, pressId) => {
        if (phase === 'down') triggerHaptic('tap')
        getClient().sendPointerButton(button, phase, pressId)
      },
    })
  }

  useEffect(() => {
    const ctrl = controllerRef.current
    return () => ctrl?.cancelAll()
  }, [])

  const toggleDragLock = () => {
    const next = !dragLocked
    setDragLocked(next)
    controllerRef.current?.setButton('left', next)
    triggerHaptic(next ? 'heavy' : 'tap')
  }

  return (
    <div className={clsx('flex flex-col gap-2 w-full h-full min-h-[150px]', className)}>
      <div
        className="trackpad-dots relative flex-1 rounded-2xl border border-white/[0.09] bg-[#12151d] touch-none select-none overflow-hidden"
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
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] tracking-wide text-zinc-500/70">
            {activeTouches >= 2 ? '双指滚动' : dragLocked ? '拖拽锁定中' : '单指移动 · 轻点左键 · 双指滚动'}
          </span>
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleDragLock}
          aria-label="拖拽锁定"
          className={clsx(
            'absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
            dragLocked
              ? 'bg-blue-500/25 border-blue-400/50 text-blue-200'
              : 'bg-white/[0.05] border-white/[0.08] text-zinc-400',
          )}
        >
          {dragLocked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
          <span>拖拽</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 h-11 shrink-0">
        <button
          type="button"
          className="tile-surface rounded-xl border border-white/[0.08] bg-[#171b24] text-xs font-medium text-zinc-300 touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            controllerRef.current?.setButton('left', true)
          }}
          onPointerUp={() => controllerRef.current?.setButton('left', false)}
          onPointerCancel={() => controllerRef.current?.setButton('left', false)}
        >
          左键
        </button>
        <button
          type="button"
          className="tile-surface rounded-xl border border-white/[0.08] bg-[#171b24] text-xs font-medium text-zinc-300 touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            controllerRef.current?.setButton('right', true)
          }}
          onPointerUp={() => controllerRef.current?.setButton('right', false)}
          onPointerCancel={() => controllerRef.current?.setButton('right', false)}
        >
          右键
        </button>
      </div>
    </div>
  )
}
