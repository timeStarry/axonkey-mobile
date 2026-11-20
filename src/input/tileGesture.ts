import type { MobileTile, TileGestureKind } from '../protocol/types'

export interface TileGestureCallbacks {
  onActivate: (tileId: string, gesture: TileGestureKind) => void
  onHoldBegin: (tileId: string, pressId: string) => void
  onHoldEnd: (tileId: string, pressId: string) => void
}

export interface TileGestureOptions {
  doubleClickWindowMs: number
  longPressWindowMs: number
  now?: () => number
}

interface PendingGesture {
  tile: MobileTile
  downAt: number | null
  longFired: boolean
  waitingSecond: boolean
  firstUpAt: number | null
  holdPressId: string | null
  longTimer: ReturnType<typeof setTimeout> | null
  doubleTimer: ReturnType<typeof setTimeout> | null
}

let pressSeq = 1
function nextPressId(tileId: string): string {
  pressSeq += 1
  return `hold-${tileId}-${pressSeq}`
}

export class TileGestureController {
  private readonly states = new Map<string, PendingGesture>()
  private readonly now: () => number
  private doubleClickWindowMs: number
  private longPressWindowMs: number

  constructor(
    private readonly callbacks: TileGestureCallbacks,
    options: TileGestureOptions,
  ) {
    this.doubleClickWindowMs = options.doubleClickWindowMs
    this.longPressWindowMs = options.longPressWindowMs
    this.now = options.now ?? (() => performance.now())
  }

  updateWindows(doubleClickWindowMs: number, longPressWindowMs: number): void {
    this.doubleClickWindowMs = doubleClickWindowMs
    this.longPressWindowMs = longPressWindowMs
  }

  onDown(tile: MobileTile): void {
    if (tile.mode === 'hold') {
      const existing = this.states.get(tile.id)
      if (existing?.holdPressId) return
      const pressId = nextPressId(tile.id)
      this.states.set(tile.id, {
        tile,
        downAt: this.now(),
        longFired: false,
        waitingSecond: false,
        firstUpAt: null,
        holdPressId: pressId,
        longTimer: null,
        doubleTimer: null,
      })
      this.callbacks.onHoldBegin(tile.id, pressId)
      return
    }

    const prev = this.states.get(tile.id)
    if (prev?.doubleTimer) {
      clearTimeout(prev.doubleTimer)
      prev.doubleTimer = null
    }
    const isSecond = Boolean(prev?.waitingSecond)
    const state: PendingGesture = {
      tile,
      downAt: this.now(),
      longFired: false,
      waitingSecond: isSecond,
      firstUpAt: null,
      holdPressId: null,
      longTimer: null,
      doubleTimer: null,
    }
    if (tile.hasLongPress) {
      state.longTimer = setTimeout(() => {
        const cur = this.states.get(tile.id)
        if (!cur || cur.downAt === null || cur.longFired) return
        cur.longFired = true
        cur.waitingSecond = false
        cur.longTimer = null
        this.callbacks.onActivate(tile.id, 'long')
      }, this.longPressWindowMs)
    }
    this.states.set(tile.id, state)
  }

  onUp(tileId: string): void {
    const state = this.states.get(tileId)
    if (!state) return

    if (state.tile.mode === 'hold') {
      const pressId = state.holdPressId
      this.clearState(tileId)
      if (pressId) {
        this.callbacks.onHoldEnd(tileId, pressId)
      }
      return
    }

    if (state.longTimer) {
      clearTimeout(state.longTimer)
      state.longTimer = null
    }
    if (state.downAt === null) return
    state.downAt = null

    if (state.longFired) {
      this.clearState(tileId)
      return
    }

    if (state.waitingSecond && state.tile.hasDoubleClick) {
      this.clearState(tileId)
      this.callbacks.onActivate(tileId, 'double')
      return
    }

    if (state.tile.hasDoubleClick) {
      state.waitingSecond = true
      state.firstUpAt = this.now()
      state.doubleTimer = setTimeout(() => {
        const cur = this.states.get(tileId)
        if (!cur || !cur.waitingSecond || cur.downAt !== null) return
        this.clearState(tileId)
        this.callbacks.onActivate(tileId, 'tap')
      }, this.doubleClickWindowMs)
      return
    }

    this.clearState(tileId)
    this.callbacks.onActivate(tileId, 'tap')
  }

  onCancel(tileId: string): void {
    const state = this.states.get(tileId)
    if (!state) return
    const holdPressId = state.holdPressId
    this.clearState(tileId)
    if (holdPressId) {
      this.callbacks.onHoldEnd(tileId, holdPressId)
    }
  }

  cancelAll(): void {
    const ids = Array.from(this.states.keys())
    for (const id of ids) {
      this.onCancel(id)
    }
  }

  private clearState(tileId: string): void {
    const state = this.states.get(tileId)
    if (!state) return
    if (state.longTimer) clearTimeout(state.longTimer)
    if (state.doubleTimer) clearTimeout(state.doubleTimer)
    this.states.delete(tileId)
  }
}
