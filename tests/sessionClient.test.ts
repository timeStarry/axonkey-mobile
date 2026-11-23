import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileSessionClient, type TransportAdapter } from '../src/transport/sessionClient'
import { DEFAULT_DEMO_DECK } from '../src/transport/defaultDeck'
import type { AxonkeyAndroidBridge } from '../src/transport/nativeBridge'
import type { ClientMessage, ServerMessage } from '../src/protocol/types'

class FakeTransport implements TransportAdapter {
  readonly usesNativeArbiter: boolean
  sent: ClientMessage[] = []
  closed = false
  handlers: Parameters<TransportAdapter['connect']>[0] | null = null

  constructor(usesNativeArbiter = false) {
    this.usesNativeArbiter = usesNativeArbiter
  }

  connect(handlers: Parameters<TransportAdapter['connect']>[0]): void {
    this.handlers = handlers
    handlers.onOpen()
  }

  send(raw: string): boolean {
    this.sent.push(JSON.parse(raw) as ClientMessage)
    return true
  }

  close(reason = ''): void {
    this.closed = true
    this.handlers?.onClose(1000, reason)
  }

  receive(msg: ServerMessage): void {
    this.handlers?.onMessage(JSON.stringify(msg))
  }
}

afterEach(() => {
  delete window.AxonkeyNative
})

describe('MobileSessionClient', () => {
  it('enforces lease TTL, sends client.alive on tick, cancels on background, and stops auto-reconnect on revoke', () => {
    let clock = 1000
    const onTextStatus = vi.fn()
    const onPhaseChange = vi.fn()
    const transport = new FakeTransport()

    const client = new MobileSessionClient(
      { onTextStatus, onPhaseChange },
      'TestPhone',
      () => clock,
    )

    client.connectToHost(
      {
        hostId: 'h1',
        hostName: 'PC',
        addrs: ['127.0.0.1:9999'],
        caCertDerB64: 'CA',
        peerId: 'p1',
        peerToken: 'tok',
        lastConnectedAt: 0,
      },
      () => transport,
    )

    expect(transport.sent[0]).toMatchObject({ type: 'client.auth', peerId: 'p1' })

    transport.receive({
      type: 'server.ready',
      sessionId: 's1',
      inputEpoch: 1,
      inputGeneration: 7,
      leaseId: 10,
      leaseTtlMs: 750,
      tickIntervalMs: 250,
      hostId: 'h1',
      hostName: 'PC',
      capabilities: {
        relativePointer: true,
        binaryPointerV1: true,
        binaryAudioV1: true,
        textCommit: true,
        audioPcm16: true,
        platform: 'windows',
      },
      deckSnapshot: DEFAULT_DEMO_DECK,
      deckRevision: 1,
      context: { appId: 'cursor.exe', appName: 'Cursor', profileName: 'Default' },
      contextRevision: 1,
    })

    expect(client.getPhase()).toBe('active')
    expect(client.getInputGeneration()).toBe(7)
    expect(client.sendTileActivate('tile.enter', 'tap')).toBeTruthy()

    // Expire lease (>750ms) -> input must be blocked
    clock = 1800
    expect(client.isInputReady()).toBe(false)
    expect(client.sendTileActivate('tile.enter', 'tap')).toBeNull()

    // Server tick refreshes lease + inputGeneration and sends client.alive
    transport.receive({
      type: 'server.tick',
      sessionId: 's1',
      inputEpoch: 1,
      inputGeneration: 8,
      leaseId: 11,
      leaseTtlMs: 750,
    })
    expect(client.isInputReady()).toBe(true)
    expect(client.getInputGeneration()).toBe(8)
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'client.alive',
      sessionId: 's1',
      leaseId: 11,
    })

    // Pending text commit becomes 'unknown' on revoke and never auto-retries
    const reqId = client.sendTextCommit('hello', 'paste', true)
    expect(reqId).toBeTruthy()
    transport.receive({
      type: 'session.revoked',
      sessionId: 's1',
      reason: 'replaced_by_new_session',
    })
    expect(client.getPhase()).toBe('closed')
    expect(onTextStatus).toHaveBeenCalledWith(reqId, 'unknown', expect.any(String))
  })

  it('routes binary pointer deltas, flushes before button edges, stamps seq:0 via native arbiter, and syncs session auth', () => {
    const wireLog: string[] = []
    let nativeSeq = 1
    const mockNative: AxonkeyAndroidBridge = {
      haptic: vi.fn(),
      setKeepScreenOn: vi.fn(),
      openQrScanner: vi.fn(),
      connectWss: vi.fn(),
      sendWssText: vi.fn(() => true),
      closeWss: vi.fn(),
      saveHostCredentials: vi.fn(),
      loadHostCredentials: vi.fn(() => '[]'),
      deleteHostCredentials: vi.fn(),
      syncSessionAuth: vi.fn((sid, epoch, gen, lease) => {
        wireLog.push(`auth:${sid}:${epoch}:${gen}:${lease}`)
      }),
      sendPointerDelta: vi.fn((dx, dy) => {
        wireLog.push(`akp1:${dx},${dy}`)
      }),
      flushPointerDelta: vi.fn(() => {
        wireLog.push('flush_akp1')
      }),
      sendControlFrame: vi.fn((raw) => {
        const parsed = JSON.parse(raw)
        if ('seq' in parsed && parsed.seq === 0) {
          parsed.seq = nativeSeq++
        }
        wireLog.push(`ctrl:${parsed.type}:seq=${parsed.seq ?? 'none'}`)
        return true
      }),
      startVoiceStream: vi.fn(() => 3),
      stopVoiceStream: vi.fn((sid) => {
        wireLog.push(`voice_stop:${sid}`)
      }),
      cancelVoiceStream: vi.fn((sid, reason) => {
        wireLog.push(`voice_cancel:${sid}:${reason}`)
      }),
    }
    window.AxonkeyNative = mockNative

    const transport = new FakeTransport(true)
    const client = new MobileSessionClient({}, 'Pixel', () => 1000)
    client.connectToHost(
      {
        hostId: 'h1',
        hostName: 'PC',
        addrs: ['192.168.1.2:49670'],
        caCertDerB64: 'CA',
        peerId: 'p1',
        peerToken: 'tok',
        lastConnectedAt: 0,
      },
      () => transport,
    )

    transport.receive({
      type: 'server.ready',
      sessionId: 'sess-9',
      inputEpoch: 2,
      inputGeneration: 15,
      leaseId: 40,
      leaseTtlMs: 750,
      tickIntervalMs: 250,
      hostId: 'h1',
      hostName: 'PC',
      capabilities: {
        relativePointer: true,
        absolutePointer: true,
        binaryPointerV1: true,
        binaryAudioV1: true,
        textCommit: true,
        audioPcm16: true,
        platform: 'windows',
      },
      deckSnapshot: DEFAULT_DEMO_DECK,
      deckRevision: 1,
      context: { appId: null, appName: null, profileName: 'Default' },
      contextRevision: 1,
    })

    wireLog.length = 0 // Focus on active session wire ordering

    expect(client.sendPointerMotion(12.5, -4)).toBe(true)
    expect(client.sendPointerButton('left', 'down', 'p-1')).toBeTruthy()
    expect(client.sendPointerButton('left', 'up', 'p-1')).toBeTruthy()

    expect(wireLog).toEqual([
      'akp1:12.5,-4',
      'flush_akp1',
      'ctrl:pointer.button:seq=1',
      'flush_akp1',
      'ctrl:pointer.button:seq=2',
    ])

    // Deck snapshot push updates epoch/generation and syncs native auth
    transport.receive({
      type: 'deck.snapshot',
      deckSnapshot: { ...DEFAULT_DEMO_DECK, voiceBindingSummary: 'Win+H' },
      deckRevision: 2,
      inputEpoch: 3,
      inputGeneration: 16,
    })
    expect(mockNative.syncSessionAuth).toHaveBeenLastCalledWith('sess-9', 3, 16, 40)

    // Voice start -> normal release routes through native AKA1 stream controller
    expect(client.startVoiceStream()).toBe(true)
    client.stopVoiceStream()
    expect(wireLog.at(-1)).toBe('voice_stop:3')

    // Voice start -> background visibility aborts with voice_cancel + input.cancel + clear auth!
    expect(client.startVoiceStream()).toBe(true)
    client.handleVisibilityHidden()
    expect(wireLog).toContain('voice_cancel:3:paused')
    expect(mockNative.syncSessionAuth).toHaveBeenLastCalledWith('', 0, 0, 0)
  })

  it('supports v2 voice.begin / voice.end / voice.cancel in JS fallback mode', () => {
    const transport = new FakeTransport(false)
    const client = new MobileSessionClient({}, 'TestPhone', () => 1000)
    client.connectToHost(
      {
        hostId: 'h1',
        hostName: 'PC',
        addrs: ['127.0.0.1:9999'],
        caCertDerB64: 'CA',
        peerId: 'p1',
        peerToken: 'tok',
        lastConnectedAt: 0,
      },
      () => transport,
    )
    transport.receive({
      type: 'server.ready',
      sessionId: 's1',
      inputEpoch: 2,
      inputGeneration: 5,
      leaseId: 1,
      leaseTtlMs: 750,
      tickIntervalMs: 250,
      hostId: 'h1',
      hostName: 'PC',
      capabilities: {
        relativePointer: true,
        binaryAudioV1: true,
        textCommit: true,
        audioPcm16: true,
        platform: 'windows',
      },
      deckSnapshot: DEFAULT_DEMO_DECK,
      deckRevision: 1,
      context: { appId: null, appName: null, profileName: 'Default' },
      contextRevision: 1,
    })

    expect(client.startVoiceStream()).toBe(true)
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'voice.begin',
      sessionId: 's1',
      inputGeneration: 5,
      streamId: 1,
    })

    client.stopVoiceStream()
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'voice.end',
      sessionId: 's1',
      inputGeneration: 5,
      streamId: 1,
    })

    // Slide-up cancel sends voice.cancel immediately
    expect(client.startVoiceStream()).toBe(true)
    client.cancelVoiceStream('user_cancelled')
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'voice.cancel',
      sessionId: 's1',
      streamId: 2,
      reason: 'user_cancelled',
    })
  })

  it('coalesces rapid back-to-back deck.update patches so sequential span/style edits never self-conflict', () => {
    const onDeckUpdate = vi.fn()
    const transport = new FakeTransport(false)
    const client = new MobileSessionClient({ onDeckUpdate }, 'TestPhone', () => 1000)

    client.connectToHost(
      {
        hostId: 'h1',
        hostName: 'PC',
        addrs: ['127.0.0.1:9999'],
        caCertDerB64: 'CA',
        peerId: 'p1',
        peerToken: 'tok',
        lastConnectedAt: 0,
      },
      () => transport,
    )
    transport.receive({
      type: 'server.ready',
      sessionId: 's1',
      inputEpoch: 1,
      inputGeneration: 1,
      leaseId: 1,
      leaseTtlMs: 750,
      tickIntervalMs: 250,
      hostId: 'h1',
      hostName: 'PC',
      capabilities: {
        relativePointer: true,
        textCommit: true,
        audioPcm16: true,
        platform: 'windows',
      },
      deckSnapshot: DEFAULT_DEMO_DECK,
      deckRevision: 5,
      context: { appId: null, appName: null, profileName: 'Default' },
      contextRevision: 1,
    })

    const req1 = client.sendDeckUpdate(5, { pointerSensitivity: 1.8 })
    // Second edit arrives while req1 is still in flight
    const req2 = client.sendDeckUpdate(5, { scrollSensitivity: 2.2 })
    expect(req1).toBeTruthy()
    expect(req2).toBe(req1)

    const deckMsgsBeforeAck = transport.sent.filter((m) => m.type === 'deck.update')
    expect(deckMsgsBeforeAck).toHaveLength(1)

    // Ack req1 with revision 6 -> client automatically flushes queued patch against baseRevision 6!
    transport.receive({
      type: 'deck.update.result',
      requestId: req1!,
      ok: true,
      deckRevision: 6,
      deckSnapshot: { ...DEFAULT_DEMO_DECK, pointerSensitivity: 1.8 },
    })

    const deckMsgsAfterAck = transport.sent.filter((m) => m.type === 'deck.update')
    expect(deckMsgsAfterAck).toHaveLength(2)
    expect(deckMsgsAfterAck[1]).toMatchObject({
      type: 'deck.update',
      baseRevision: 6,
      layoutPatch: { scrollSensitivity: 2.2 },
    })
  })
})
