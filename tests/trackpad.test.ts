import { describe, expect, it, vi } from 'vitest'
import { TrackpadController, type TrackpadScheduler } from '../src/input/trackpad'

function createManualScheduler() {
  let nextId = 1
  const callbacks = new Map<number, () => void>()
  const scheduler: TrackpadScheduler = {
    requestFrame: (cb) => {
      const id = nextId++
      callbacks.set(id, cb)
      return id
    },
    cancelFrame: (id) => {
      callbacks.delete(id)
    },
  }
  return {
    scheduler,
    pendingCount: () => callbacks.size,
    runNextFrame: () => {
      const entries = Array.from(callbacks.entries())
      callbacks.clear()
      for (const [, cb] of entries) cb()
    },
  }
}

describe('TrackpadController (v2 rAF coalescing & edge ordering)', () => {
  it('schedules at most ONE pending rAF across multiple pointermove events and sums deltas', () => {
    let clock = 0
    const raf = createManualScheduler()
    const events: string[] = []
    const ctrl = new TrackpadController(
      {
        onMotion: (dx, dy) => events.push(`move:${dx},${dy}`),
        onScroll: (x, y) => events.push(`scroll:${x},${y}`),
        onButton: (btn, phase) => events.push(`btn:${btn}:${phase}`),
      },
      () => clock,
      raf.scheduler,
    )

    ctrl.onPointerDown(1, 100, 100)
    clock = 4
    ctrl.onPointerMove(1, 110, 105)
    expect(raf.pendingCount()).toBe(1)

    clock = 9
    ctrl.onPointerMove(1, 118, 112)
    clock = 25 // Even past 16ms, no hardcoded timer jump — waits cleanly for the single rAF!
    ctrl.onPointerMove(1, 125, 120)
    expect(raf.pendingCount()).toBe(1)
    expect(events).toEqual([])

    raf.runNextFrame()
    expect(raf.pendingCount()).toBe(0)
    expect(events).toEqual(['move:25,20'])
  })

  it('synchronously flushes remaining delta before button edges and before pointerup drag-end', () => {
    let clock = 0
    const raf = createManualScheduler()
    const events: string[] = []
    const ctrl = new TrackpadController(
      {
        onMotion: (dx, dy) => events.push(`move:${dx},${dy}`),
        onScroll: (x, y) => events.push(`scroll:${x},${y}`),
        onButton: (btn, phase) => events.push(`btn:${btn}:${phase}`),
      },
      () => clock,
      raf.scheduler,
    )

    ctrl.onPointerDown(1, 100, 100)
    clock = 5
    ctrl.onPointerMove(1, 110, 105)
    clock = 10
    ctrl.onPointerMove(1, 115, 112)
    expect(events).toEqual([])

    // Explicit button press must flush accumulated motion first and cancel pending rAF
    ctrl.setButton('left', true)
    expect(raf.pendingCount()).toBe(0)
    expect(events).toEqual(['move:15,12', 'btn:left:down'])

    // Subsequent drag movement followed by pointerup before rAF fires:
    // pointerup MUST flush the residual (7, -3) synchronously!
    clock = 14
    ctrl.onPointerMove(1, 122, 109)
    expect(raf.pendingCount()).toBe(1)
    ctrl.onPointerUp(1)
    expect(raf.pendingCount()).toBe(0)
    expect(events).toEqual(['move:15,12', 'btn:left:down', 'move:7,-3'])

    // Releasing button finishes drag cleanly
    ctrl.setButton('left', false)
    expect(events).toEqual(['move:15,12', 'btn:left:down', 'move:7,-3', 'btn:left:up'])
  })

  it('discards unsent residual delta and cancels held drag button on pointercancel', () => {
    let clock = 0
    const raf = createManualScheduler()
    const events: string[] = []
    const ctrl = new TrackpadController(
      {
        onMotion: (dx, dy) => events.push(`move:${dx},${dy}`),
        onScroll: (x, y) => events.push(`scroll:${x},${y}`),
        onButton: (btn, phase) => events.push(`btn:${btn}:${phase}`),
      },
      () => clock,
      raf.scheduler,
    )

    ctrl.setButton('left', true)
    expect(events).toEqual(['btn:left:down'])

    ctrl.onPointerDown(1, 50, 50)
    clock = 8
    ctrl.onPointerMove(1, 80, 75)
    expect(raf.pendingCount()).toBe(1)

    // System gesture interruption -> discard (30, 25) delta AND release held left button!
    ctrl.onPointerCancel(1)
    expect(raf.pendingCount()).toBe(0)
    expect(ctrl.isButtonHeld('left')).toBe(false)
    expect(events).toEqual(['btn:left:down', 'btn:left:up'])

    // Running frame afterwards does nothing
    raf.runNextFrame()
    expect(events).toEqual(['btn:left:down', 'btn:left:up'])
  })

  it('supports 1-finger double-tap-and-slide drag and flushes final delta before left:up', () => {
    let clock = 100
    const raf = createManualScheduler()
    const events: string[] = []
    const ctrl = new TrackpadController(
      {
        onMotion: (dx, dy) => events.push(`move:${dx},${dy}`),
        onScroll: () => {},
        onButton: (btn, phase) => events.push(`btn:${btn}:${phase}`),
      },
      () => clock,
      raf.scheduler,
    )

    // First tap
    ctrl.onPointerDown(1, 40, 40)
    clock = 140
    ctrl.onPointerUp(1)
    expect(events).toEqual(['btn:left:down', 'btn:left:up'])
    events.length = 0

    // Second touch within 260ms + slide -> engages left drag, streams motion, flushes before left:up!
    clock = 240
    ctrl.onPointerDown(2, 42, 42)
    clock = 260
    ctrl.onPointerMove(2, 62, 52) // > 8px threshold -> engages left:down then queues (20, 10)
    expect(events).toEqual(['btn:left:down'])

    clock = 280
    ctrl.onPointerUp(2) // Must flush move:20,10 BEFORE btn:left:up!
    expect(events).toEqual(['btn:left:down', 'move:20,10', 'btn:left:up'])
  })

  it('switches from 1 finger to 2 fingers without pointer jump and emits scroll', () => {
    let clock = 0
    const raf = createManualScheduler()
    const onMotion = vi.fn()
    const onScroll = vi.fn()
    const ctrl = new TrackpadController(
      { onMotion, onScroll, onButton: vi.fn() },
      () => clock,
      raf.scheduler,
    )

    ctrl.onPointerDown(1, 50, 50)
    clock = 20
    ctrl.onPointerMove(1, 60, 50)

    // Adding second finger far away synchronously flushes 1-finger delta (10, 0) and resets 2-finger centroid
    ctrl.onPointerDown(2, 160, 50)
    expect(onMotion).toHaveBeenCalledTimes(1)
    expect(onMotion).toHaveBeenCalledWith(10, 0)
    onMotion.mockClear()

    clock = 40
    ctrl.onPointerMove(1, 60, 90)
    ctrl.onPointerMove(2, 160, 90)
    raf.runNextFrame()
    expect(onMotion).not.toHaveBeenCalled()
    expect(onScroll).toHaveBeenCalledWith(0, 10)
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

  it('recognizes 3-finger tap and 4-directional 3-finger OS touchpad swipes (>36px) cleanly without liftoff scroll/click jitter', () => {
    let clock = 100
    const raf = createManualScheduler()
    const onMotion = vi.fn()
    const onScroll = vi.fn()
    const onButton = vi.fn()
    const onSystemGesture = vi.fn()

    const ctrl = new TrackpadController(
      { onMotion, onScroll, onButton, onSystemGesture },
      () => clock,
      raf.scheduler,
    )

    // 1. 3-finger tap -> 'three_finger_tap' (no right-click!)
    ctrl.onPointerDown(1, 100, 100)
    ctrl.onPointerDown(2, 130, 100)
    ctrl.onPointerDown(3, 160, 100)
    clock = 160
    ctrl.onPointerUp(1)
    ctrl.onPointerUp(2)
    ctrl.onPointerUp(3)

    expect(onSystemGesture).toHaveBeenCalledTimes(1)
    expect(onSystemGesture).toHaveBeenLastCalledWith('three_finger_tap')
    expect(onButton).not.toHaveBeenCalled()

    // 2. 3-finger swipe UP (>36px) -> 'three_finger_up', fires once & suppresses liftoff scroll
    onSystemGesture.mockClear()
    clock = 300
    ctrl.onPointerDown(1, 100, 200)
    ctrl.onPointerDown(2, 130, 200)
    ctrl.onPointerDown(3, 160, 200)
    clock = 340
    ctrl.onPointerMove(1, 100, 150)
    ctrl.onPointerMove(2, 130, 150)
    ctrl.onPointerMove(3, 160, 150) // centroid dy = -50 -> > 36px
    // Continued drag and staggered liftoff must not re-fire or scroll
    ctrl.onPointerMove(1, 100, 130)
    ctrl.onPointerUp(3)
    ctrl.onPointerMove(1, 100, 120)
    ctrl.onPointerUp(2)
    ctrl.onPointerUp(1)
    raf.runNextFrame()

    expect(onSystemGesture).toHaveBeenCalledTimes(1)
    expect(onSystemGesture).toHaveBeenLastCalledWith('three_finger_up')
    expect(onMotion).not.toHaveBeenCalled()
    expect(onScroll).not.toHaveBeenCalled()
    expect(onButton).not.toHaveBeenCalled()

    // 3. 3-finger swipe DOWN, LEFT, RIGHT
    const swipe3 = (dx: number, dy: number) => {
      clock += 100
      ctrl.onPointerDown(1, 200, 200)
      ctrl.onPointerDown(2, 220, 200)
      ctrl.onPointerDown(3, 240, 200)
      clock += 30
      ctrl.onPointerMove(1, 200 + dx, 200 + dy)
      ctrl.onPointerMove(2, 220 + dx, 200 + dy)
      ctrl.onPointerMove(3, 240 + dx, 200 + dy)
      ctrl.onPointerUp(1)
      ctrl.onPointerUp(2)
      ctrl.onPointerUp(3)
    }

    onSystemGesture.mockClear()
    swipe3(0, 48)
    expect(onSystemGesture).toHaveBeenLastCalledWith('three_finger_down')

    swipe3(-52, 4)
    expect(onSystemGesture).toHaveBeenLastCalledWith('three_finger_left')

    swipe3(55, -5)
    expect(onSystemGesture).toHaveBeenLastCalledWith('three_finger_right')
    expect(onSystemGesture).toHaveBeenCalledTimes(3)

    // 4. Disabling 3-finger gestures suppresses onSystemGesture
    onSystemGesture.mockClear()
    ctrl.setThreeFingerGesturesEnabled(false)
    swipe3(0, -50)
    expect(onSystemGesture).not.toHaveBeenCalled()
  })
})
