import type { PointerButtonName, PointerButtonPhase } from '../protocol/types'

export interface TrackpadCallbacks {
  onMotion: (dx: number, dy: number) => void
  onScroll: (x: number, y: number) => void
  onButton: (button: PointerButtonName, phase: PointerButtonPhase, pressId: string) => void
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
const BATCH_INTERVAL_MS = 16

let btnSeq = 1
function nextButtonPressId(button: PointerButtonName): string {
  btnSeq += 1
  return `ptr-${button}-${btnSeq}`
}

export class TrackpadController {
  private readonly contacts = new Map<number, ActiveContact>()
  private readonly heldButtons = new Map<PointerButtonName, string>()
  private readonly now: () => number

  private pendingDx = 0
  private pendingDy = 0
  private pendingScrollX = 0
  private pendingScrollY = 0
  private lastFlushMs = 0

  private gestureMaxFingers = 0
  private gestureMoved = false
  private gestureStartMs = 0
  private twoFingerCentroid: { x: number; y: number } | null = null

  constructor(
    private readonly callbacks: TrackpadCallbacks,
    now?: () => number,
  ) {
    this.now = now ?? (() => performance.now())
  }

  onPointerDown(pointerId: number, x: number, y: number): void {
    const ts = this.now()
    if (this.contacts.size === 0) {
      this.gestureMaxFingers = 0
      this.gestureMoved = false
      this.gestureStartMs = ts
    }
    this.contacts.set(pointerId, { x, y, startX: x, startY: y, startMs: ts })
    this.gestureMaxFingers = Math.max(this.gestureMaxFingers, this.contacts.size)

    // Reset baseline when transitioning 1 -> 2 fingers so cursor never jumps.
    if (this.contacts.size === 2) {
      this.flush()
      this.twoFingerCentroid = this.computeCentroid()
    }
  }

  onPointerMove(pointerId: number, x: number, y: number): void {
    const contact = this.contacts.get(pointerId)
    if (!contact) return

    const dx = x - contact.x
    const dy = y - contact.y
    contact.x = x
    contact.y = y

    const totalDist = Math.hypot(x - contact.startX, y - contact.startY)
    if (totalDist > TAP_MAX_DISTANCE) {
      this.gestureMoved = true
    }

    if (this.contacts.size === 1) {
      this.pendingDx += dx
      this.pendingDy += dy
      this.maybeFlush()
    } else if (this.contacts.size >= 2) {
      const nextCentroid = this.computeCentroid()
      if (this.twoFingerCentroid && nextCentroid) {
        const sdx = nextCentroid.x - this.twoFingerCentroid.x
        const sdy = nextCentroid.y - this.twoFingerCentroid.y
        // Positive Y scroll moves content naturally.
        this.pendingScrollX += sdx * 0.25
        this.pendingScrollY += sdy * 0.25
        this.twoFingerCentroid = nextCentroid
        this.maybeFlush()
      } else {
        this.twoFingerCentroid = nextCentroid
      }
    }
  }

  onPointerUp(pointerId: number): void {
    if (!this.contacts.has(pointerId)) return
    this.flush()
    this.contacts.delete(pointerId)

    if (this.contacts.size < 2) {
      this.twoFingerCentroid = null
    }

    if (this.contacts.size === 0) {
      const elapsed = this.now() - this.gestureStartMs
      if (!this.gestureMoved && elapsed <= TAP_MAX_DURATION_MS) {
        const button: PointerButtonName = this.gestureMaxFingers >= 2 ? 'right' : 'left'
        const pressId = nextButtonPressId(button)
        this.callbacks.onButton(button, 'down', pressId)
        this.callbacks.onButton(button, 'up', pressId)
      }
      this.gestureMaxFingers = 0
      this.gestureMoved = false
    }
  }

  onPointerCancel(pointerId: number): void {
    if (!this.contacts.has(pointerId)) return
    this.contacts.delete(pointerId)
    this.twoFingerCentroid = null
    this.pendingDx = 0
    this.pendingDy = 0
    this.pendingScrollX = 0
    this.pendingScrollY = 0
    this.gestureMoved = true
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

  flush(): void {
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
    this.lastFlushMs = this.now()
  }

  cancelAll(): void {
    this.contacts.clear()
    this.twoFingerCentroid = null
    this.pendingDx = 0
    this.pendingDy = 0
    this.pendingScrollX = 0
    this.pendingScrollY = 0
    this.gestureMoved = true
    const entries = Array.from(this.heldButtons.entries())
    this.heldButtons.clear()
    for (const [button, pressId] of entries) {
      this.callbacks.onButton(button, 'up', pressId)
    }
  }

  private maybeFlush(): void {
    if (this.now() - this.lastFlushMs >= BATCH_INTERVAL_MS) {
      this.flush()
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
