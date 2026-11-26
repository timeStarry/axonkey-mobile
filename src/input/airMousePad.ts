import type { PointerButtonName } from '../protocol/types'

export type AirMousePadClutchMode = 'hold' | 'none'

export interface AirMousePadCallbacks {
  onClutchChange: (engaged: boolean) => void
  onClick: (button: Extract<PointerButtonName, 'left' | 'right'>) => void
  onStabilizePulse?: () => void
  onFallbackTapWhenDisabled?: () => void
}

export interface AirMousePadOptions {
  tapClickEnabled?: boolean
  clutchMode?: AirMousePadClutchMode
  holdThresholdMs?: number
  doubleTapWindowMs?: number
  maxTapTravelPx?: number
  now?: () => number
}

const DEFAULT_HOLD_THRESHOLD_MS = 165
const DEFAULT_DOUBLE_TAP_WINDOW_MS = 210
const DEFAULT_MAX_TAP_TRAVEL_PX = 28

/**
 * Ergonomic gesture controller for the Air-Mouse main control pad:
 * - When `tapClickEnabled` is `true`:
 *   - Quick single tap (`< holdThresholdMs`) -> Left Click (after `doubleTapWindowMs` disambiguation)
 *   - Quick double tap -> Right Click immediately on 2nd lift
 *   - Press & hold (`>= holdThresholdMs`) -> Engages Air-Mouse gyro clutch (`onClutchChange(true)`)
 *     until release, emitting zero accidental clicks.
 *   - Single tap immediately followed by press & hold -> Flushes the 1st Left Click right before
 *     engaging the gyro clutch so tap-then-move workflows never drop the initial click.
 * - When `tapClickEnabled` is `false`:
 *   - `'hold'` mode engages the gyro clutch immediately (`0ms`) on `pointerDown` and never clicks.
 *   - `'none'` mode invokes `onFallbackTapWhenDisabled` (e.g. laser recenter) on quick tap.
 */
export class AirMousePadController {
  private tapClickEnabled: boolean
  private clutchMode: AirMousePadClutchMode
  private readonly holdThresholdMs: number
  private readonly doubleTapWindowMs: number
  private readonly maxTapTravelPx: number
  private readonly now: () => number

  private activePointerId: number | null = null
  private startX = 0
  private startY = 0
  private startMs = 0
  private exceededTravel = false
  private holdEngaged = false
  private waitingSecondTap = false
  private isSecondTap = false

  private holdTimer: ReturnType<typeof setTimeout> | null = null
  private doubleTapTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly callbacks: AirMousePadCallbacks,
    options?: AirMousePadOptions,
  ) {
    this.tapClickEnabled = options?.tapClickEnabled ?? true
    this.clutchMode = options?.clutchMode ?? 'hold'
    this.holdThresholdMs = options?.holdThresholdMs ?? DEFAULT_HOLD_THRESHOLD_MS
    this.doubleTapWindowMs = options?.doubleTapWindowMs ?? DEFAULT_DOUBLE_TAP_WINDOW_MS
    this.maxTapTravelPx = options?.maxTapTravelPx ?? DEFAULT_MAX_TAP_TRAVEL_PX
    this.now = options?.now ?? (() => performance.now())
  }

  configure(next: { tapClickEnabled?: boolean; clutchMode?: AirMousePadClutchMode }): void {
    const prevTap = this.tapClickEnabled
    const prevMode = this.clutchMode
    if (next.tapClickEnabled !== undefined) {
      this.tapClickEnabled = next.tapClickEnabled
    }
    if (next.clutchMode !== undefined) {
      this.clutchMode = next.clutchMode
    }
    if (!this.tapClickEnabled && prevTap) {
      this.clearDoubleTapTimer()
      this.waitingSecondTap = false
      this.isSecondTap = false
    }
    if (this.clutchMode !== prevMode && this.holdEngaged && this.clutchMode === 'none') {
      this.holdEngaged = false
      this.callbacks.onClutchChange(false)
    }
  }

  onPointerDown(pointerId: number, x: number, y: number): void {
    if (this.activePointerId !== null) return

    this.activePointerId = pointerId
    this.startX = x
    this.startY = y
    this.startMs = this.now()
    this.exceededTravel = false
    this.clearHoldTimer()

    if (!this.tapClickEnabled) {
      this.waitingSecondTap = false
      this.isSecondTap = false
      if (this.clutchMode === 'hold') {
        this.engageHoldIfNeeded()
      }
      return
    }

    this.callbacks.onStabilizePulse?.()

    if (this.waitingSecondTap) {
      this.clearDoubleTapTimer()
      this.waitingSecondTap = false
      this.isSecondTap = true
    } else {
      this.isSecondTap = false
    }

    this.holdTimer = setTimeout(() => {
      this.holdTimer = null
      if (this.activePointerId !== pointerId) return
      this.transitionToHold()
    }, this.holdThresholdMs)
  }

  onPointerMove(pointerId: number, x: number, y: number): void {
    if (this.activePointerId !== pointerId || this.exceededTravel) return
    const dist = Math.hypot(x - this.startX, y - this.startY)
    if (dist <= this.maxTapTravelPx) return

    this.exceededTravel = true
    if (!this.tapClickEnabled) return

    if (this.holdTimer !== null) {
      this.clearHoldTimer()
      this.transitionToHold()
    }
  }

  onPointerUp(pointerId: number): void {
    if (this.activePointerId !== pointerId) return
    this.activePointerId = null
    this.clearHoldTimer()

    const elapsed = this.now() - this.startMs

    if (!this.tapClickEnabled) {
      if (this.holdEngaged) {
        this.holdEngaged = false
        this.callbacks.onClutchChange(false)
      } else if (
        this.clutchMode === 'none' &&
        !this.exceededTravel &&
        elapsed <= DEFAULT_DOUBLE_TAP_WINDOW_MS + 50
      ) {
        this.callbacks.onFallbackTapWhenDisabled?.()
      }
      return
    }

    if (this.holdEngaged) {
      this.holdEngaged = false
      this.isSecondTap = false
      if (this.clutchMode === 'hold') {
        this.callbacks.onClutchChange(false)
      }
      return
    }

    if (this.exceededTravel || elapsed > this.holdThresholdMs + 40) {
      if (this.isSecondTap) {
        this.isSecondTap = false
        this.callbacks.onClick('left')
      }
      return
    }

    if (this.isSecondTap) {
      this.isSecondTap = false
      this.callbacks.onClick('right')
      return
    }

    this.waitingSecondTap = true
    this.clearDoubleTapTimer()
    this.doubleTapTimer = setTimeout(() => {
      this.doubleTapTimer = null
      if (!this.waitingSecondTap) return
      this.waitingSecondTap = false
      this.callbacks.onClick('left')
    }, this.doubleTapWindowMs)
  }

  onPointerCancel(pointerId?: number): void {
    if (pointerId !== undefined && this.activePointerId !== pointerId) return
    this.cancelAll()
  }

  cancelAll(): void {
    this.activePointerId = null
    this.exceededTravel = false
    this.waitingSecondTap = false
    this.isSecondTap = false
    this.clearHoldTimer()
    this.clearDoubleTapTimer()
    if (this.holdEngaged) {
      this.holdEngaged = false
      if (this.clutchMode === 'hold') {
        this.callbacks.onClutchChange(false)
      }
    }
  }

  private transitionToHold(): void {
    if (this.isSecondTap) {
      this.isSecondTap = false
      this.callbacks.onClick('left')
    }
    this.engageHoldIfNeeded()
  }

  private engageHoldIfNeeded(): void {
    this.holdEngaged = true
    if (this.clutchMode === 'hold') {
      this.callbacks.onClutchChange(true)
    }
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer)
      this.holdTimer = null
    }
  }

  private clearDoubleTapTimer(): void {
    if (this.doubleTapTimer !== null) {
      clearTimeout(this.doubleTapTimer)
      this.doubleTapTimer = null
    }
  }
}
