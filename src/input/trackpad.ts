import type {
  PointerButtonName,
  PointerButtonPhase,
  SystemTouchpadGesture,
} from '../protocol/types'

export interface TrackpadCallbacks {
  onMotion: (dx: number, dy: number) => void
  onScroll: (x: number, y: number) => void
  onButton: (button: PointerButtonName, phase: PointerButtonPhase, pressId: string) => void
  onSystemGesture?: (gesture: SystemTouchpadGesture) => void
}

export interface TrackpadScheduler {
  requestFrame: (cb: () => void) => number
  cancelFrame: (id: number) => void
}

interface ActiveContact {
  x: number
  y: number
  startX: number
  startY: number
  startMs: number
}

const TAP_MAX_DISTANCE = 8
const TAP_MAX_DURATION_MS = 220
const DOUBLE_TAP_DRAG_WINDOW_MS = 260
const DOUBLE_TAP_MAX_DIST = 26
const THREE_FINGER_SWIPE_THRESHOLD = 36

const defaultScheduler: TrackpadScheduler = {
  requestFrame: (cb) =>
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame(() => cb())
      : (setTimeout(cb, 16) as unknown as number),
  cancelFrame: (id) => {
    if (typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(id)
    } else {
      clearTimeout(id)
    }
  },
}

let btnSeq = 1
function nextButtonPressId(button: PointerButtonName): string {
  btnSeq += 1
  return `ptr-${button}-${btnSeq}`
}

export class TrackpadController {
  private readonly contacts = new Map<number, ActiveContact>()
  private readonly heldButtons = new Map<PointerButtonName, string>()
  private readonly now: () => number
  private readonly scheduler: TrackpadScheduler

  private pendingDx = 0
  private pendingDy = 0
  private pendingScrollX = 0
  private pendingScrollY = 0
  private rafId: number | null = null

  private gestureMaxFingers = 0
  private gestureMoved = false
  private gestureStartMs = 0
  private twoFingerCentroid: { x: number; y: number } | null = null
  private threeFingerEnabled = true
  private threeFingerStartCentroid: { x: number; y: number } | null = null
  private threeFingerSwipeFired = false

  // 1-finger double-tap-and-slide drag state
  private lastSingleTapUpMs = 0
  private lastSingleTapX = 0
  private lastSingleTapY = 0
  private eligibleForTapDrag = false
  private tapDragActive = false

  constructor(
    private readonly callbacks: TrackpadCallbacks,
    now?: () => number,
    scheduler?: TrackpadScheduler,
  ) {
    this.now = now ?? (() => performance.now())
    this.scheduler = scheduler ?? defaultScheduler
  }

  setThreeFingerGesturesEnabled(enabled: boolean): void {
    this.threeFingerEnabled = enabled
  }

  private isThreeFingerActive(): boolean {
    return Boolean(this.callbacks.onSystemGesture) && this.threeFingerEnabled
  }

  onPointerDown(pointerId: number, x: number, y: number): void {
    const ts = this.now()
    if (this.contacts.size === 0) {
      this.gestureMaxFingers = 0
      this.gestureMoved = false
      this.gestureStartMs = ts
      this.threeFingerStartCentroid = null
      this.threeFingerSwipeFired = false
      this.eligibleForTapDrag =
        this.lastSingleTapUpMs > 0 &&
        ts - this.lastSingleTapUpMs <= DOUBLE_TAP_DRAG_WINDOW_MS &&
        Math.hypot(x - this.lastSingleTapX, y - this.lastSingleTapY) <= DOUBLE_TAP_MAX_DIST
    } else {
      this.eligibleForTapDrag = false
      if (this.tapDragActive) {
        this.tapDragActive = false
        this.setButton('left', false)
      }
    }

    this.contacts.set(pointerId, { x, y, startX: x, startY: y, startMs: ts })
    this.gestureMaxFingers = Math.max(this.gestureMaxFingers, this.contacts.size)

    // Reset baseline when transitioning 1 -> 2 fingers so cursor never jumps.
    if (this.contacts.size === 2 && this.gestureMaxFingers === 2) {
      this.flush()
      this.twoFingerCentroid = this.computeCentroid()
    } else if (this.contacts.size === 3 && this.isThreeFingerActive()) {
      // Transitioning into 3-finger OS gesture: discard tiny pre-landing scroll/motion
      this.cancelScheduledFlush()
      this.pendingDx = 0
      this.pendingDy = 0
      this.pendingScrollX = 0
      this.pendingScrollY = 0
      this.twoFingerCentroid = null
      this.threeFingerStartCentroid = this.computeCentroid()
      this.threeFingerSwipeFired = false
      this.gestureMoved = false
      this.gestureStartMs = ts
    }
  }

  onPointerMove(pointerId: number, x: number, y: number): void {
    const contact = this.contacts.get(pointerId)
    if (!contact) return

    const dx = x - contact.x
    const dy = y - contact.y
    contact.x = x
    contact.y = y

    if (this.gestureMaxFingers >= 3 && this.isThreeFingerActive()) {
      if (this.contacts.size >= 3 && !this.threeFingerSwipeFired) {
        const cur = this.computeCentroid()
        if (!this.threeFingerStartCentroid) {
          this.threeFingerStartCentroid = cur
          return
        }
        if (cur) {
          const gdx = cur.x - this.threeFingerStartCentroid.x
          const gdy = cur.y - this.threeFingerStartCentroid.y
          const dist = Math.hypot(gdx, gdy)
          if (dist > TAP_MAX_DISTANCE) {
            this.gestureMoved = true
          }
          if (dist > THREE_FINGER_SWIPE_THRESHOLD) {
            this.threeFingerSwipeFired = true
            this.gestureMoved = true
            const gesture: SystemTouchpadGesture =
              Math.abs(gdx) >= Math.abs(gdy)
                ? gdx > 0
                  ? 'three_finger_right'
                  : 'three_finger_left'
                : gdy > 0
                  ? 'three_finger_down'
                  : 'three_finger_up'
            this.callbacks.onSystemGesture?.(gesture)
          }
        }
      }
      return
    }

    const totalDist = Math.hypot(x - contact.startX, y - contact.startY)
    if (totalDist > TAP_MAX_DISTANCE) {
      this.gestureMoved = true
      if (this.contacts.size === 1 && this.eligibleForTapDrag && !this.tapDragActive) {
        this.eligibleForTapDrag = false
        this.tapDragActive = true
        this.lastSingleTapUpMs = 0
        this.setButton('left', true)
      }
    }

    if (this.contacts.size === 1 && this.gestureMaxFingers === 1) {
      if (dx !== 0 || dy !== 0) {
        this.pendingDx += dx
        this.pendingDy += dy
        this.scheduleFlush()
      }
    } else if (this.contacts.size >= 2) {
      const nextCentroid = this.computeCentroid()
      if (this.twoFingerCentroid && nextCentroid) {
        const sdx = nextCentroid.x - this.twoFingerCentroid.x
        const sdy = nextCentroid.y - this.twoFingerCentroid.y
        this.twoFingerCentroid = nextCentroid
        if (sdx !== 0 || sdy !== 0) {
          // Positive Y scroll moves content naturally.
          this.pendingScrollX += sdx * 0.25
          this.pendingScrollY += sdy * 0.25
          this.scheduleFlush()
        }
      } else {
        this.twoFingerCentroid = nextCentroid
      }
    }
  }

  onPointerUp(pointerId: number): void {
    const contact = this.contacts.get(pointerId)
    if (!contact) return

    // Synchronously flush any unsent residual delta BEFORE tap or drag-end button message!
    this.flush()
    this.contacts.delete(pointerId)

    if (this.contacts.size < 2) {
      this.twoFingerCentroid = null
    }

    if (this.contacts.size === 0) {
      if (this.tapDragActive) {
        this.tapDragActive = false
        this.eligibleForTapDrag = false
        this.setButton('left', false)
      } else if (this.gestureMaxFingers >= 3 && this.isThreeFingerActive()) {
        const ts = this.now()
        const elapsed = ts - this.gestureStartMs
        if (!this.threeFingerSwipeFired && !this.gestureMoved && elapsed <= TAP_MAX_DURATION_MS) {
          this.callbacks.onSystemGesture?.('three_finger_tap')
        }
        this.lastSingleTapUpMs = 0
      } else {
        const ts = this.now()
        const elapsed = ts - this.gestureStartMs
        if (!this.gestureMoved && elapsed <= TAP_MAX_DURATION_MS) {
          const button: PointerButtonName = this.gestureMaxFingers >= 2 ? 'right' : 'left'
          const pressId = nextButtonPressId(button)
          this.callbacks.onButton(button, 'down', pressId)
          this.callbacks.onButton(button, 'up', pressId)

          if (button === 'left') {
            if (this.eligibleForTapDrag) {
              this.lastSingleTapUpMs = 0
              this.eligibleForTapDrag = false
            } else {
              this.lastSingleTapUpMs = ts
              this.lastSingleTapX = contact.x
              this.lastSingleTapY = contact.y
            }
          } else {
            this.lastSingleTapUpMs = 0
          }
        } else {
          this.lastSingleTapUpMs = 0
        }
      }
      this.gestureMaxFingers = 0
      this.gestureMoved = false
      this.threeFingerStartCentroid = null
      this.threeFingerSwipeFired = false
      this.eligibleForTapDrag = false
    }
  }

  onPointerCancel(pointerId: number): void {
    if (!this.contacts.has(pointerId)) return
    this.contacts.delete(pointerId)
    this.cancelScheduledFlush()
    this.twoFingerCentroid = null
    this.threeFingerStartCentroid = null
    this.threeFingerSwipeFired = false
    // Discard unsent residual delta on cancel (never inject cancelled movement).
    this.pendingDx = 0
    this.pendingDy = 0
    this.pendingScrollX = 0
    this.pendingScrollY = 0
    this.gestureMoved = true
    this.tapDragActive = false
    this.eligibleForTapDrag = false
    this.lastSingleTapUpMs = 0
    // Release any held drag button so desktop never stays stuck in drag state.
    this.releaseHeldButtons()
  }

  setButton(button: PointerButtonName, down: boolean): void {
    // Always flush motion BEFORE button edge so relative movement never reorders across clicks/drags.
    this.flush()
    if (down) {
      if (this.heldButtons.has(button)) return
      const pressId = nextButtonPressId(button)
      this.heldButtons.set(button, pressId)
      this.callbacks.onButton(button, 'down', pressId)
    } else {
      const pressId = this.heldButtons.get(button)
      if (!pressId) return
      this.heldButtons.delete(button)
      this.callbacks.onButton(button, 'up', pressId)
    }
  }

  isButtonHeld(button: PointerButtonName): boolean {
    return this.heldButtons.has(button)
  }

  hasPendingFrame(): boolean {
    return this.rafId !== null
  }

  flush(): void {
    this.cancelScheduledFlush()
    if (this.pendingDx !== 0 || this.pendingDy !== 0) {
      const dx = this.pendingDx
      const dy = this.pendingDy
      this.pendingDx = 0
      this.pendingDy = 0
      this.callbacks.onMotion(dx, dy)
    }
    if (this.pendingScrollX !== 0 || this.pendingScrollY !== 0) {
      const sx = this.pendingScrollX
      const sy = this.pendingScrollY
      this.pendingScrollX = 0
      this.pendingScrollY = 0
      this.callbacks.onScroll(sx, sy)
    }
  }

  cancelAll(): void {
    this.contacts.clear()
    this.cancelScheduledFlush()
    this.twoFingerCentroid = null
    this.threeFingerStartCentroid = null
    this.threeFingerSwipeFired = false
    this.pendingDx = 0
    this.pendingDy = 0
    this.pendingScrollX = 0
    this.pendingScrollY = 0
    this.gestureMoved = true
    this.tapDragActive = false
    this.eligibleForTapDrag = false
    this.lastSingleTapUpMs = 0
    this.releaseHeldButtons()
  }

  private scheduleFlush(): void {
    if (this.rafId !== null) return
    this.rafId = this.scheduler.requestFrame(() => {
      this.rafId = null
      this.flush()
    })
  }

  private cancelScheduledFlush(): void {
    if (this.rafId !== null) {
      const id = this.rafId
      this.rafId = null
      this.scheduler.cancelFrame(id)
    }
  }

  private releaseHeldButtons(): void {
    const entries = Array.from(this.heldButtons.entries())
    this.heldButtons.clear()
    for (const [button, pressId] of entries) {
      this.callbacks.onButton(button, 'up', pressId)
    }
  }

  private computeCentroid(): { x: number; y: number } | null {
    if (this.contacts.size === 0) return null
    let sx = 0
    let sy = 0
    for (const c of this.contacts.values()) {
      sx += c.x
      sy += c.y
    }
    return { x: sx / this.contacts.size, y: sy / this.contacts.size }
  }
}
