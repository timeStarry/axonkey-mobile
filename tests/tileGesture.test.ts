import { describe, expect, it, vi } from 'vitest'
import { TileGestureController } from '../src/input/tileGesture'
import type { MobileTile } from '../src/protocol/types'

function makeTile(overrides: Partial<MobileTile> = {}): MobileTile {
  return {
    id: 't1',
    label: 'Test',
    icon: 'zap',
    accent: 'blue',
    colSpan: 1,
    mode: 'gesture',
    hasDoubleClick: false,
    hasLongPress: false,
    ...overrides,
  }
}

describe('TileGestureController', () => {
  it('fires tap immediately with zero delay when double-click is disabled', () => {
    vi.useFakeTimers()
    const onActivate = vi.fn()
    const ctrl = new TileGestureController(
      { onActivate, onHoldBegin: vi.fn(), onHoldEnd: vi.fn() },
      { doubleClickWindowMs: 300, longPressWindowMs: 600 },
    )
    const tile = makeTile({ hasDoubleClick: false })
    ctrl.onDown(tile)
    ctrl.onUp(tile.id)
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenCalledWith('t1', 'tap')
    vi.useRealTimers()
  })

  it('distinguishes tap vs double when double-click is enabled', () => {
    vi.useFakeTimers()
    const onActivate = vi.fn()
    const ctrl = new TileGestureController(
      { onActivate, onHoldBegin: vi.fn(), onHoldEnd: vi.fn() },
      { doubleClickWindowMs: 300, longPressWindowMs: 600 },
    )
    const tile = makeTile({ hasDoubleClick: true })

    // Single tap fires after 300ms window
    ctrl.onDown(tile)
    ctrl.onUp(tile.id)
    expect(onActivate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(onActivate).toHaveBeenCalledWith('t1', 'tap')

    onActivate.mockClear()
    // Double tap inside 300ms window
    ctrl.onDown(tile)
    ctrl.onUp(tile.id)
    vi.advanceTimersByTime(120)
    ctrl.onDown(tile)
    ctrl.onUp(tile.id)
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenCalledWith('t1', 'double')
    vi.useRealTimers()
  })

  it('fires long press at 600ms and does not synthesize tap on release', () => {
    vi.useFakeTimers()
    const onActivate = vi.fn()
    const ctrl = new TileGestureController(
      { onActivate, onHoldBegin: vi.fn(), onHoldEnd: vi.fn() },
      { doubleClickWindowMs: 300, longPressWindowMs: 600 },
    )
    const tile = makeTile({ hasLongPress: true })
    ctrl.onDown(tile)
    vi.advanceTimersByTime(600)
    expect(onActivate).toHaveBeenCalledWith('t1', 'long')
    ctrl.onUp(tile.id)
    expect(onActivate).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('cancel never synthesizes tap and clears pending timers', () => {
    vi.useFakeTimers()
    const onActivate = vi.fn()
    const ctrl = new TileGestureController(
      { onActivate, onHoldBegin: vi.fn(), onHoldEnd: vi.fn() },
      { doubleClickWindowMs: 300, longPressWindowMs: 600 },
    )
    const tile = makeTile({ hasDoubleClick: true, hasLongPress: true })
    ctrl.onDown(tile)
    ctrl.onCancel(tile.id)
    vi.advanceTimersByTime(1000)
    expect(onActivate).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('hold mode sends begin and releases with the exact original pressId', () => {
    const onHoldBegin = vi.fn()
    const onHoldEnd = vi.fn()
    const ctrl = new TileGestureController(
      { onActivate: vi.fn(), onHoldBegin, onHoldEnd },
      { doubleClickWindowMs: 300, longPressWindowMs: 600 },
    )
    const tile = makeTile({ id: 'ptt', mode: 'hold' })
    ctrl.onDown(tile)
    expect(onHoldBegin).toHaveBeenCalledTimes(1)
    const pressId = onHoldBegin.mock.calls[0][1]
    ctrl.onCancel('ptt')
    expect(onHoldEnd).toHaveBeenCalledWith('ptt', pressId)
  })
})
