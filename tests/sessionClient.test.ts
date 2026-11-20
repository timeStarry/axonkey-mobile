import { describe, expect, it, vi } from 'vitest'
import { MobileSessionClient, type TransportAdapter } from '../src/transport/sessionClient'
import { DEFAULT_DEMO_DECK } from '../src/transport/defaultDeck'
import type { ClientMessage, ServerMessage } from '../src/protocol/types'

class FakeTransport implements TransportAdapter {
  sent: ClientMessage[] = []
  closed = false
  handlers: Parameters<TransportAdapter['connect']>[0] | null = null

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
      leaseId: 10,
      leaseTtlMs: 750,
      tickIntervalMs: 250,
      hostId: 'h1',
      hostName: 'PC',
      capabilities: { relativePointer: true, textCommit: true, audioPcm16: false, platform: 'windows' },
      deckSnapshot: DEFAULT_DEMO_DECK,
      deckRevision: 1,
      context: { appId: 'cursor.exe', appName: 'Cursor', profileName: 'Default' },
      contextRevision: 1,
    })

    expect(client.getPhase()).toBe('active')
    expect(client.sendTileActivate('tile.enter', 'tap')).toBeTruthy()

    // Expire lease (>750ms) -> input must be blocked
    clock = 1800
    expect(client.isInputReady()).toBe(false)
    expect(client.sendTileActivate('tile.enter', 'tap')).toBeNull()

    // Server tick refreshes lease and sends client.alive
    transport.receive({
      type: 'server.tick',
      sessionId: 's1',
      inputEpoch: 1,
      leaseId: 11,
      leaseTtlMs: 750,
    })
    expect(client.isInputReady()).toBe(true)
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

  it('sends input.cancel immediately when app goes to background', () => {
    const transport = new FakeTransport()
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
      leaseId: 1,
      leaseTtlMs: 750,
      tickIntervalMs: 250,
      hostId: 'h1',
      hostName: 'PC',
      capabilities: { relativePointer: true, textCommit: true, audioPcm16: false, platform: 'windows' },
      deckSnapshot: DEFAULT_DEMO_DECK,
      deckRevision: 1,
      context: { appId: null, appName: null, profileName: 'Default' },
      contextRevision: 1,
    })

    client.handleVisibilityHidden()
    expect(transport.sent.some((m) => m.type === 'input.cancel' && m.reason === 'app_backgrounded')).toBe(true)
    expect(client.getPhase()).toBe('disconnected')
  })
})
