import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AirMousePadController } from './airMousePad'

describe('AirMousePadController (Single-Tap Left, Double-Tap Right, Hold Gyro Clutch)', () => {
  let nowMs = 1_000

  beforeEach(() => {
    vi.useFakeTimers()
    nowMs = 1_000
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function advance(ms: number) {
    nowMs += ms
    vi.advanceTimersByTime(ms)
  }

  it('fires left click on quick single tap without engaging gyro clutch', () => {
    const events: string[] = []
    const pad = new AirMousePadController(
      {
        onClutchChange: (engaged) => events.push(`clutch:${engaged}`),
        onClick: (btn) => events.push(`click:${btn}`),
        onStabilizePulse: () => events.push('stabilize'),
      },
      { tapClickEnabled: true, clutchMode: 'hold', now: () => nowMs },
    )

    pad.onPointerDown(1, 100, 120)
    expect(events).toEqual(['stabilize'])

    advance(70)
    pad.onPointerUp(1)
    expect(events).toEqual(['stabilize'])

    advance(210)
    expect(events).toEqual(['stabilize', 'click:left'])
  })

  it('fires right click immediately on quick double tap without left click or clutch drift', () => {
    const events: string[] = []
    const pad = new AirMousePadController(
      {
        onClutchChange: (engaged) => events.push(`clutch:${engaged}`),
        onClick: (btn) => events.push(`click:${btn}`),
      },
      { tapClickEnabled: true, clutchMode: 'hold', now: () => nowMs },
    )

    pad.onPointerDown(1, 100, 120)
    advance(60)
    pad.onPointerUp(1)

    advance(95)
    pad.onPointerDown(2, 104, 118)
    advance(55)
    pad.onPointerUp(2)

    expect(events).toEqual(['click:right'])

    advance(300)
    expect(events).toEqual(['click:right'])
  })

  it('engages and releases hold-to-move clutch cleanly with zero clicks when held past threshold', () => {
    const events: string[] = []
    const pad = new AirMousePadController(
      {
        onClutchChange: (engaged) => events.push(`clutch:${engaged}`),
        onClick: (btn) => events.push(`click:${btn}`),
      },
      { tapClickEnabled: true, clutchMode: 'hold', now: () => nowMs },
    )

    pad.onPointerDown(1, 100, 120)
    advance(165)
    expect(events).toEqual(['clutch:true'])

    advance(450)
    pad.onPointerUp(1)
    expect(events).toEqual(['clutch:true', 'clutch:false'])

    advance(300)
    expect(events).toEqual(['clutch:true', 'clutch:false'])
  })

  it('flushes pending single-tap left click before engaging clutch when tap is followed by hold', () => {
    const events: string[] = []
    const pad = new AirMousePadController(
      {
        onClutchChange: (engaged) => events.push(`clutch:${engaged}`),
        onClick: (btn) => events.push(`click:${btn}`),
      },
      { tapClickEnabled: true, clutchMode: 'hold', now: () => nowMs },
    )

    pad.onPointerDown(1, 100, 120)
    advance(60)
    pad.onPointerUp(1)

    advance(80)
    pad.onPointerDown(2, 102, 122)
    advance(165)
    expect(events).toEqual(['click:left', 'clutch:true'])

    advance(400)
    pad.onPointerUp(2)
    expect(events).toEqual(['click:left', 'clutch:true', 'clutch:false'])
  })

  it('engages clutch immediately at 0ms and disables tap clicks when tapClickEnabled is false', () => {
    const events: string[] = []
    const pad = new AirMousePadController(
      {
        onClutchChange: (engaged) => events.push(`clutch:${engaged}`),
        onClick: (btn) => events.push(`click:${btn}`),
        onFallbackTapWhenDisabled: () => events.push('fallback:recenter'),
      },
      { tapClickEnabled: false, clutchMode: 'hold', now: () => nowMs },
    )

    pad.onPointerDown(1, 100, 120)
    expect(events).toEqual(['clutch:true'])
    advance(50)
    pad.onPointerUp(1)
    expect(events).toEqual(['clutch:true', 'clutch:false'])
    advance(300)
    expect(events).toEqual(['clutch:true', 'clutch:false'])

    // In laser ('none') mode with tapClickEnabled=false, tapping invokes fallback recenter
    pad.configure({ tapClickEnabled: false, clutchMode: 'none' })
    pad.onPointerDown(2, 100, 120)
    advance(50)
    pad.onPointerUp(2)
    expect(events).toEqual(['clutch:true', 'clutch:false', 'fallback:recenter'])
  })
})
