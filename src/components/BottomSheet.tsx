import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { useMobileStore } from '../state/useMobileStore'
import { setNativeBackIntercept, triggerHaptic } from '../transport/nativeBridge'

interface SheetStackEntry {
  id: number
  close: () => void
}

const activeSheets: SheetStackEntry[] = []
let sheetSeq = 1
let globalListenersAttached = false
let pushedSheetHistory = false

function syncBackIntercept() {
  setNativeBackIntercept(activeSheets.length > 0)
}

function dismissTopSheet(): boolean {
  const top = activeSheets.at(-1)
  if (!top) return false
  top.close()
  return true
}

function ensureGlobalSheetListeners() {
  if (typeof window === 'undefined' || globalListenersAttached) return
  globalListenersAttached = true

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeSheets.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      dismissTopSheet()
    }
  })

  window.addEventListener('popstate', () => {
    pushedSheetHistory = false
    if (activeSheets.length > 0) {
      dismissTopSheet()
      if (activeSheets.length > 0 && typeof window.history?.pushState === 'function') {
        try {
          window.history.pushState({ __axonkeySheet: true }, '')
          pushedSheetHistory = true
        } catch {
          // Ignore restricted history environments
        }
      }
    }
  })

  window.__axonkeyNativeOnBack = () => {
    dismissTopSheet()
  }
}

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  headerRight?: ReactNode
  closeAriaLabel?: string
  testId?: string
  children: ReactNode
}

const SWIPE_DISMISS_PX = 48

export function BottomSheet({
  open,
  onClose,
  title,
  headerRight,
  closeAriaLabel = '关闭',
  testId = 'bottom-sheet-backdrop',
  children,
}: BottomSheetProps) {
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const isLight = effectiveTheme === 'light'

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [dragOffsetY, setDragOffsetY] = useState(0)
  const dragRef = useRef<{ pointerId: number | null; startY: number }>({
    pointerId: null,
    startY: 0,
  })

  useEffect(() => {
    if (!open) {
      setDragOffsetY(0)
      dragRef.current.pointerId = null
      return
    }

    ensureGlobalSheetListeners()
    const entryId = sheetSeq++
    activeSheets.push({
      id: entryId,
      close: () => onCloseRef.current(),
    })
    syncBackIntercept()

    if (
      typeof window !== 'undefined' &&
      !pushedSheetHistory &&
      typeof window.history?.pushState === 'function'
    ) {
      try {
        window.history.pushState({ __axonkeySheet: true }, '')
        pushedSheetHistory = true
      } catch {
        // Ignore history restrictions
      }
    }

    return () => {
      const idx = activeSheets.findIndex((item) => item.id === entryId)
      if (idx >= 0) {
        activeSheets.splice(idx, 1)
      }
      syncBackIntercept()
    }
  }, [open])

  if (!open) return null

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest('button')) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY }
    setDragOffsetY(0)
  }

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return
    const dy = e.clientY - dragRef.current.startY
    setDragOffsetY(dy > 0 ? dy : 0)
  }

  const finishHeaderDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (dragRef.current.pointerId !== e.pointerId) return
    const dy = e.clientY - dragRef.current.startY
    dragRef.current.pointerId = null
    setDragOffsetY(0)
    if (!cancelled && dy > SWIPE_DISMISS_PX) {
      triggerHaptic('tap')
      onClose()
    }
  }

  return (
    <div
      data-testid={testId}
      data-sheet-backdrop="true"
      onClick={() => {
        triggerHaptic('tap')
        onClose()
      }}
      className="ak-backdrop fixed inset-0 z-50 flex items-end justify-center backdrop-blur-[2px]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={
          dragOffsetY > 0
            ? { transform: `translateY(${Math.round(dragOffsetY)}px)` }
            : undefined
        }
        className={clsx(
          'ak-sheet w-full max-w-md rounded-t-[26px] border-t px-4 pt-2.5 pb-5 safe-bottom max-h-[88vh] flex flex-col shadow-2xl',
          dragOffsetY === 0 && 'transition-transform duration-150 ease-out',
        )}
      >
        {/* Top Grabber + Title Handle Zone (Supports Swipe-Down > 48px to Dismiss) */}
        <div
          data-testid="bottom-sheet-handle"
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={(e) => finishHeaderDrag(e, false)}
          onPointerCancel={(e) => finishHeaderDrag(e, true)}
          className="shrink-0 pb-3 touch-none select-none cursor-grab active:cursor-grabbing"
        >
          <div
            className={clsx(
              'w-9 h-1 rounded-full mx-auto mb-2.5',
              isLight ? 'bg-black/15' : 'bg-white/20',
            )}
          />
          <div className="flex items-center justify-between gap-2">
            <h2 className="ak-text-1 text-[15px] font-semibold tracking-tight truncate">
              {title}
            </h2>
            <div className="flex items-center gap-1.5 shrink-0">
              {headerRight}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  onClose()
                }}
                aria-label={closeAriaLabel}
                className="ak-pill ak-text-2 w-7 h-7 rounded-full border inline-flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Sheet Body */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-3.5">
          {children}
        </div>
      </div>
    </div>
  )
}
