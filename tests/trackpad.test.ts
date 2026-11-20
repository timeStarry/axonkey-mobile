import { describe, expect, it, vi } from 'vitest'
import { TrackpadController } from '../src/input/trackpad'

describe('TrackpadController', () => {
  it('coalesces 1-finger motion at 60Hz and flushes before button edge', () => {
    let clock = 0
    const events: string[] = []
    const ctrl = new TrackpadController(
      {
        onMotion: (dx, dy) => events.push(`move:${dx},${dy}`),
        onScroll: (x, y) => events.push(`scroll:${x},${y}`),
        onButton: (btn, phase) => events.push(`btn:${btn}:${phase}`),
      },
      () => clock,
    )

    ctrl.onPointerDown(1, 100, 100)
    clock = 5
    ctrl.onPointerMove(1, 110, 105)
    clock = 10
    ctrl.onPointerMove(1, 115, 112)
    expect(events).toEqual([])

    // Explicit button press must flush accumulated motion first
    ctrl.setButton('left', true)
    expect(events).toEqual(['move:15,12', 'btn:left:down'])

    // cancelAll releases held drag button cleanly
    ctrl.cancelAll()
    expect(events).toEqual(['move:15,12', 'btn:left:down', 'btn:left:up'])
  })

  it('switches from 1 finger to 2 fingers without pointer jump and emits scroll', () => {
    let clock = 0
    const onMotion = vi.fn()
    const onScroll = vi.fn()
    const ctrl = new TrackpadController(
      { onMotion, onScroll, onButton: vi.fn() },
      () => clock,
    )

    ctrl.onPointerDown(1, 50, 50)
    clock = 20
    ctrl.onPointerMove(1, 60, 50)
    expect(onMotion).toHaveBeenCalledWith(10, 0)
    onMotion.mockClear()

    // Add second finger far away — must NOT emit pointer motion
    ctrl.onPointerDown(2, 160, 50)
    expect(onMotion).not.toHaveBeenCalled()

    clock = 40
    ctrl.onPointerMove(1, 60, 90)
    ctrl.onPointerMove(2, 160, 90)
    ctrl.flush()
    expect(onMotion).not.toHaveBeenCalled()
    expect(onScroll).toHaveBeenCalled()
  })

  it('recognizes 1-finger tap as left click and 2-finger tap as right click', () => {
    let clock = 100
    const onButton = vi.fn()
    const ctrl = new TrackpadController(
      { onMotion: vi.fn(), onScroll: vi.fn(), onButton },
      () => clock,
    )

    ctrl.onPointerDown(1, 40, 40)
    clock = 150
    ctrl.onPointerUp(1)
    expect(onButton).toHaveBeenNthCalledWith(1, 'left', 'down', expect.any(String))
    expect(onButton).toHaveBeenNthCalledWith(2, 'left', 'up', expect.any(String))

    onButton.mockClear()
    clock = 300
    ctrl.onPointerDown(1, 40, 40)
    ctrl.onPointerDown(2, 80, 40)
    clock = 360
    ctrl.onPointerUp(1)
    ctrl.onPointerUp(2)
    expect(onButton).toHaveBeenNthCalledWith(1, 'right', 'down', expect.any(String))
    expect(onButton).toHaveBeenNthCalledWith(2, 'right', 'up', expect.any(String))
  })
})
