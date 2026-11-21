import {
  MOBILE_PROTOCOL,
  type ClientMessage,
  type DeckLayoutPatch,
  type DeckSnapshot,
  type ForegroundContext,
  type HostCapabilities,
  type PairingOfferQr,
  type PointerButtonName,
  type PointerButtonPhase,
  type ServerMessage,
  type SessionPhase,
  type TextCommitMode,
  type TileGestureKind,
} from '../protocol/types'
import { DEFAULT_DEMO_DECK } from './defaultDeck'
import {
  isNativeShell,
  startNativeAudioCapture,
  stopNativeAudioCapture,
  type SavedHostProfile,
} from './nativeBridge'

export interface TransportAdapter {
  connect(handlers: {
    onOpen: () => void
    onMessage: (raw: string) => void
    onClose: (code: number, reason: string) => void
    onError: (message: string) => void
  }): void
  send(raw: string): boolean
  close(reason?: string): void
}

export interface SessionListener {
  onPhaseChange?: (phase: SessionPhase, detail?: string) => void
  onReady?: (payload: {
    hostId: string
    hostName: string
    capabilities: HostCapabilities
    deckSnapshot: DeckSnapshot
    deckRevision: number
    context: ForegroundContext
    contextRevision: number
  }) => void
  onPaired?: (host: SavedHostProfile) => void
  onDeckUpdate?: (snapshot: DeckSnapshot, revision: number) => void
  onDeckConflict?: (latestSnapshot: DeckSnapshot, latestRevision: number, message: string) => void
  onContextChanged?: (context: ForegroundContext, revision: number) => void
  onCommandResult?: (requestId: string, ok: boolean, code?: string, message?: string) => void
  onTextStatus?: (requestId: string, status: 'sent' | 'ok' | 'error' | 'unknown', message?: string) => void
  onError?: (message: string) => void
}

const BACKOFF_MS = [150, 300, 600, 1500]

export class NativeWssTransport implements TransportAdapter {
  constructor(
    private readonly url: string,
    private readonly hostId: string,
    private readonly caCertDerB64: string,
  ) {}

  connect(handlers: {
    onOpen: () => void
    onMessage: (raw: string) => void
    onClose: (code: number, reason: string) => void
    onError: (message: string) => void
  }): void {
    if (isNativeShell() && window.AxonkeyNative) {
      window.__axonkeyNativeOnOpen = handlers.onOpen
      window.__axonkeyNativeOnMessage = handlers.onMessage
      window.__axonkeyNativeOnClose = handlers.onClose
      window.__axonkeyNativeOnError = handlers.onError
      window.AxonkeyNative.connectWss(this.url, this.hostId, this.caCertDerB64, MOBILE_PROTOCOL)
      return
    }
    const ws = new WebSocket(this.url, [MOBILE_PROTOCOL])
    this.fallbackWs = ws
    ws.onopen = () => handlers.onOpen()
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') handlers.onMessage(e.data)
    }
    ws.onclose = (e) => handlers.onClose(e.code, e.reason)
    ws.onerror = () => handlers.onError('WebSocket 连接失败（局域网 WSS 需在原生 App 中建立私有信任）')
  }

  private fallbackWs: WebSocket | null = null

  send(raw: string): boolean {
    if (isNativeShell() && window.AxonkeyNative) {
      return window.AxonkeyNative.sendWssText(raw)
    }
    if (this.fallbackWs && this.fallbackWs.readyState === WebSocket.OPEN) {
      this.fallbackWs.send(raw)
      return true
    }
    return false
  }

  close(reason = 'client_close'): void {
    if (isNativeShell() && window.AxonkeyNative) {
      window.AxonkeyNative.closeWss(reason)
      return
    }
    this.fallbackWs?.close(1000, reason)
    this.fallbackWs = null
  }
}

/** Local loopback simulator so Mobile UI can be tested end-to-end without a live desktop host. */
export class DemoLoopbackTransport implements TransportAdapter {
  private onMessage: ((raw: string) => void) | null = null
  private onClose: ((code: number, reason: string) => void) | null = null
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private deck: DeckSnapshot = structuredClone(DEFAULT_DEMO_DECK)
  private deckRev = 1
  private ctxRev = 1
  private leaseId = 1
  private sessionId = 'demo-session-1'

  connect(handlers: {
    onOpen: () => void
    onMessage: (raw: string) => void
    onClose: (code: number, reason: string) => void
    onError: (message: string) => void
  }): void {
    this.onMessage = handlers.onMessage
    this.onClose = handlers.onClose
    setTimeout(() => handlers.onOpen(), 20)
  }

  send(raw: string): boolean {
    const msg = JSON.parse(raw) as ClientMessage
    if (msg.type === 'client.auth') {
      this.leaseId = 1
      this.emit({
        type: 'server.ready',
        sessionId: this.sessionId,
        inputEpoch: 1,
        leaseId: this.leaseId,
        leaseTtlMs: 750,
        tickIntervalMs: 250,
        hostId: 'demo-desktop',
        hostName: 'Demo Desktop (模拟)',
        capabilities: {
          relativePointer: true,
          textCommit: true,
          audioPcm16: false,
          platform: 'windows',
        },
        deckSnapshot: structuredClone(this.deck),
        deckRevision: this.deckRev,
        context: {
          appId: 'cursor.exe',
          appName: 'Cursor',
          profileName: 'Vibe Coding',
        },
        contextRevision: this.ctxRev,
      })
      this.tickTimer = setInterval(() => {
        this.leaseId += 1
        this.emit({
          type: 'server.tick',
          sessionId: this.sessionId,
          inputEpoch: 1,
          leaseId: this.leaseId,
          leaseTtlMs: 750,
        })
      }, 250)
      return true
    }
    if (msg.type === 'tile.activate' || msg.type === 'tile.hold.begin' || msg.type === 'tile.hold.end' || msg.type === 'pointer.button' || msg.type === 'text.commit') {
      this.emit({ type: 'command.result', requestId: msg.requestId, ok: true })
      return true
    }
    if (msg.type === 'deck.update') {
      if (msg.baseRevision !== this.deckRev) {
        this.emit({
          type: 'deck.update.result',
          requestId: msg.requestId,
          ok: false,
          conflict: true,
          deckRevision: this.deckRev,
          deckSnapshot: structuredClone(this.deck),
          error: '版本冲突',
        })
      } else {
        this.deck = {
          ...this.deck,
          ...(msg.layoutPatch.activePageId ? { activePageId: msg.layoutPatch.activePageId } : {}),
          ...(msg.layoutPatch.trackpadSplit !== undefined
            ? { trackpadSplit: msg.layoutPatch.trackpadSplit }
            : {}),
          ...(msg.layoutPatch.pointerSensitivity !== undefined
            ? { pointerSensitivity: msg.layoutPatch.pointerSensitivity }
            : {}),
          ...(msg.layoutPatch.scrollSensitivity !== undefined
            ? { scrollSensitivity: msg.layoutPatch.scrollSensitivity }
            : {}),
          ...(msg.layoutPatch.pages ? { pages: structuredClone(msg.layoutPatch.pages) } : {}),
        }
        this.deckRev += 1
        this.emit({
          type: 'deck.update.result',
          requestId: msg.requestId,
          ok: true,
          conflict: false,
          deckRevision: this.deckRev,
          deckSnapshot: structuredClone(this.deck),
        })
      }
      return true
    }
    return true
  }

  close(reason = 'closed'): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    this.onClose?.(1000, reason)
  }

  private emit(msg: ServerMessage): void {
    this.onMessage?.(JSON.stringify(msg))
  }
}

export class MobileSessionClient {
  private phase: SessionPhase = 'disconnected'
  private transport: TransportAdapter | null = null
  private sessionId: string | null = null
  private inputEpoch = 0
  private seq = 0
  private leaseId = 0
  private leaseExpiresAtMs = 0
  private contextRevision = 0
  private pendingTextRequests = new Set<string>()
  private pendingDeckRequests = new Map<string, number>()

  private activeHost: SavedHostProfile | null = null
  private pendingPairOffer: PairingOfferQr | null = null
  private transportFactory: ((host: SavedHostProfile) => TransportAdapter) | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private allowAutoReconnect = true
  private readonly now: () => number
  private reqCounter = 1

  constructor(
    private readonly listener: SessionListener,
    private readonly deviceName = 'Axonkey Mobile',
    now?: () => number,
  ) {
    this.now = now ?? (() => Date.now())
  }

  getPhase(): SessionPhase {
    return this.phase
  }

  isInputReady(): boolean {
    return (
      this.phase === 'active' &&
      this.sessionId !== null &&
      this.now() <= this.leaseExpiresAtMs
    )
  }

  connectWithPairing(offer: PairingOfferQr, transport: TransportAdapter): void {
    this.disconnect('switch_to_pair')
    this.pendingPairOffer = offer
    this.allowAutoReconnect = false
    this.setPhase('authenticating', '正在配对…')
    this.attachTransport(transport, () => {
      this.sendRaw({
        type: 'pair.request',
        pairToken: offer.pairToken,
        deviceName: this.deviceName,
      })
    })
  }

  connectToHost(
    host: SavedHostProfile,
    factory: (host: SavedHostProfile) => TransportAdapter,
  ): void {
    this.disconnect('reconnect_explicit')
    this.activeHost = host
    this.transportFactory = factory
    this.pendingPairOffer = null
    this.allowAutoReconnect = true
    this.reconnectAttempt = 0
    this.openHostConnection()
  }

  disconnect(reason = 'user_disconnect'): void {
    stopNativeAudioCapture()
    this.allowAutoReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.phase === 'active' && this.sessionId) {
      this.sendRaw({
        type: 'input.cancel',
        sessionId: this.sessionId,
        inputEpoch: this.inputEpoch,
        reason,
      })
    }
    this.markPendingTextsUnknown()
    this.transport?.close(reason)
    this.transport = null
    this.sessionId = null
    this.leaseExpiresAtMs = 0
    this.setPhase('disconnected')
  }

  handleVisibilityHidden(): void {
    stopNativeAudioCapture()
    if (this.phase === 'active' && this.sessionId) {
      this.sendRaw({
        type: 'input.cancel',
        sessionId: this.sessionId,
        inputEpoch: this.inputEpoch,
        reason: 'app_backgrounded',
      })
      this.leaseExpiresAtMs = 0
      this.setPhase('revoking', '应用切至后台，已暂停输入')
      this.transport?.close('app_backgrounded')
      this.transport = null
      this.sessionId = null
      this.setPhase('disconnected', '回到前台将自动重连')
    }
  }

  handleVisibilityVisible(): void {
    if (
      this.phase === 'disconnected' &&
      this.allowAutoReconnect &&
      this.activeHost &&
      this.transportFactory
    ) {
      this.reconnectAttempt = 0
      this.openHostConnection()
    }
  }

  sendTileActivate(tileId: string, gesture: TileGestureKind): string | null {
    if (!this.isInputReady() || !this.sessionId) return null
    const requestId = this.nextRequestId('tile')
    const ok = this.sendRaw({
      type: 'tile.activate',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: ++this.seq,
      leaseId: this.leaseId,
      requestId,
      tileId,
      gesture,
    })
    return ok ? requestId : null
  }

  sendTileHold(tileId: string, pressId: string, begin: boolean): string | null {
    if (begin && !this.isInputReady()) return null
    if (!this.sessionId || this.phase !== 'active') return null
    const requestId = this.nextRequestId('hold')
    const ok = this.sendRaw({
      type: begin ? 'tile.hold.begin' : 'tile.hold.end',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: ++this.seq,
      leaseId: this.leaseId,
      requestId,
      tileId,
      pressId,
    })
    return ok ? requestId : null
  }

  sendPointerMotion(dx: number, dy: number): boolean {
    if (!this.isInputReady() || !this.sessionId) return false
    return this.sendRaw({
      type: 'pointer.motion',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: ++this.seq,
      leaseId: this.leaseId,
      dx,
      dy,
    })
  }

  sendPointerScroll(x: number, y: number): boolean {
    if (!this.isInputReady() || !this.sessionId) return false
    return this.sendRaw({
      type: 'pointer.scroll',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: ++this.seq,
      leaseId: this.leaseId,
      x,
      y,
    })
  }

  sendPointerButton(
    button: PointerButtonName,
    phase: PointerButtonPhase,
    pressId: string,
  ): string | null {
    if (phase === 'down' && !this.isInputReady()) return null
    if (!this.sessionId || this.phase !== 'active') return null
    const requestId = this.nextRequestId('btn')
    const ok = this.sendRaw({
      type: 'pointer.button',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: ++this.seq,
      leaseId: this.leaseId,
      requestId,
      button,
      phase,
      pressId,
    })
    return ok ? requestId : null
  }

  sendTextCommit(text: string, mode: TextCommitMode, submit: boolean): string | null {
    if (!this.isInputReady() || !this.sessionId || !text.trim()) return null
    const requestId = this.nextRequestId('txt')
    const ok = this.sendRaw({
      type: 'text.commit',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: ++this.seq,
      leaseId: this.leaseId,
      requestId,
      text,
      mode,
      submit,
      contextRevision: this.contextRevision,
    })
    if (!ok) return null
    this.pendingTextRequests.add(requestId)
    this.listener.onTextStatus?.(requestId, 'sent')
    return requestId
  }

  sendDeckUpdate(baseRevision: number, layoutPatch: DeckLayoutPatch): string | null {
    if (!this.sessionId || this.phase !== 'active') return null
    const requestId = this.nextRequestId('deck')
    const ok = this.sendRaw({
      type: 'deck.update',
      sessionId: this.sessionId,
      requestId,
      baseRevision,
      layoutPatch,
    })
    if (!ok) return null
    this.pendingDeckRequests.set(requestId, baseRevision)
    return requestId
  }

  startVoiceStream(): boolean {
    if (!this.isInputReady() || !this.sessionId) return false
    const sent = this.sendRaw({
      type: 'audio.start',
      sessionId: this.sessionId,
      sampleRate: 16000,
      channels: 1,
    })
    if (!sent) return false
    if (isNativeShell()) {
      const started = startNativeAudioCapture()
      if (!started) {
        this.sendRaw({ type: 'audio.stop', sessionId: this.sessionId })
        return false
      }
    }
    return true
  }

  stopVoiceStream(): void {
    stopNativeAudioCapture()
    if (this.sessionId && this.phase === 'active') {
      this.sendRaw({ type: 'audio.stop', sessionId: this.sessionId })
    }
  }

  private openHostConnection(): void {
    if (!this.activeHost || !this.transportFactory) return
    const host = this.activeHost
    this.setPhase('authenticating', `正在连接 ${host.hostName}…`)
    const adapter = this.transportFactory(host)
    this.attachTransport(adapter, () => {
      this.setPhase('synchronizing', '正在同步配置…')
      this.sendRaw({
        type: 'client.auth',
        peerId: host.peerId,
        peerToken: host.peerToken,
        deviceName: this.deviceName,
      })
    })
  }

  private attachTransport(adapter: TransportAdapter, onOpen: () => void): void {
    this.transport = adapter
    adapter.connect({
      onOpen,
      onMessage: (raw) => this.handleServerRaw(raw),
      onClose: (_code, reason) => this.handleTransportClosed(reason),
      onError: (msg) => {
        this.listener.onError?.(msg)
      },
    })
  }

  private handleServerRaw(raw: string): void {
    let msg: ServerMessage
    try {
      msg = JSON.parse(raw) as ServerMessage
    } catch {
      return
    }

    switch (msg.type) {
      case 'pair.result': {
        if (msg.ok && msg.peerId && msg.peerToken && this.pendingPairOffer) {
          const offer = this.pendingPairOffer
          this.pendingPairOffer = null
          const profile: SavedHostProfile = {
            hostId: offer.hostId,
            hostName: offer.hostName,
            addrs: offer.addrs,
            caCertDerB64: offer.caCertDerB64,
            peerId: msg.peerId,
            peerToken: msg.peerToken,
            lastConnectedAt: this.now(),
          }
          this.activeHost = profile
          this.allowAutoReconnect = true
          this.listener.onPaired?.(profile)
          this.setPhase('synchronizing', '配对成功，正在认证…')
          this.sendRaw({
            type: 'client.auth',
            peerId: profile.peerId,
            peerToken: profile.peerToken,
            deviceName: this.deviceName,
          })
        } else {
          this.listener.onError?.(msg.error ?? '配对失败')
          this.disconnect('pair_failed')
        }
        break
      }
      case 'server.ready': {
        this.sessionId = msg.sessionId
        this.inputEpoch = msg.inputEpoch
        this.seq = 0
        this.leaseId = msg.leaseId
        this.leaseExpiresAtMs = this.now() + msg.leaseTtlMs
        this.contextRevision = msg.contextRevision
        this.reconnectAttempt = 0
        this.setPhase('active')
        this.listener.onReady?.({
          hostId: msg.hostId,
          hostName: msg.hostName,
          capabilities: msg.capabilities,
          deckSnapshot: msg.deckSnapshot,
          deckRevision: msg.deckRevision,
          context: msg.context,
          contextRevision: msg.contextRevision,
        })
        break
      }
      case 'server.tick': {
        if (msg.sessionId !== this.sessionId || msg.inputEpoch !== this.inputEpoch) return
        this.leaseId = msg.leaseId
        this.leaseExpiresAtMs = this.now() + msg.leaseTtlMs
        this.sendRaw({
          type: 'client.alive',
          sessionId: this.sessionId,
          leaseId: this.leaseId,
        })
        break
      }
      case 'deck.snapshot': {
        this.inputEpoch = msg.inputEpoch
        this.listener.onDeckUpdate?.(msg.deckSnapshot, msg.deckRevision)
        break
      }
      case 'context.changed': {
        this.contextRevision = msg.contextRevision
        this.listener.onContextChanged?.(msg.context, msg.contextRevision)
        break
      }
      case 'deck.update.result': {
        this.pendingDeckRequests.delete(msg.requestId)
        if (msg.ok && msg.deckSnapshot) {
          this.listener.onDeckUpdate?.(msg.deckSnapshot, msg.deckRevision)
        } else if (msg.conflict && msg.deckSnapshot) {
          this.listener.onDeckConflict?.(
            msg.deckSnapshot,
            msg.deckRevision,
            msg.error ?? '配置已被其他端更新',
          )
        } else {
          this.listener.onError?.(msg.error ?? '保存布局失败')
        }
        break
      }
      case 'command.result': {
        if (this.pendingTextRequests.delete(msg.requestId)) {
          this.listener.onTextStatus?.(
            msg.requestId,
            msg.ok ? 'ok' : 'error',
            msg.message,
          )
        }
        this.listener.onCommandResult?.(msg.requestId, msg.ok, msg.code, msg.message)
        break
      }
      case 'session.revoked': {
        // Never auto-reclaim control when replaced or revoked by desktop.
        this.allowAutoReconnect = false
        this.markPendingTextsUnknown()
        this.sessionId = null
        this.leaseExpiresAtMs = 0
        this.setPhase('closed', `会话已撤销 (${msg.reason})`)
        this.transport?.close('revoked')
        this.transport = null
        break
      }
      case 'error': {
        this.listener.onError?.(msg.message)
        break
      }
    }
  }

  private handleTransportClosed(reason: string): void {
    this.markPendingTextsUnknown()
    this.sessionId = null
    this.leaseExpiresAtMs = 0
    this.transport = null
    if (this.phase === 'closed') return

    this.setPhase('disconnected', reason || '连接已断开')
    if (this.allowAutoReconnect && this.activeHost && this.transportFactory) {
      const delay = BACKOFF_MS[Math.min(this.reconnectAttempt, BACKOFF_MS.length - 1)]
      this.reconnectAttempt += 1
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        this.openHostConnection()
      }, delay)
    }
  }

  private markPendingTextsUnknown(): void {
    for (const reqId of this.pendingTextRequests) {
      this.listener.onTextStatus?.(reqId, 'unknown', '连接中断，发送结果未知（未自动重发）')
    }
    this.pendingTextRequests.clear()
  }

  private sendRaw(msg: ClientMessage): boolean {
    if (!this.transport) return false
    return this.transport.send(JSON.stringify(msg))
  }

  private nextRequestId(prefix: string): string {
    this.reqCounter += 1
    return `${prefix}-${this.reqCounter}`
  }

  private setPhase(phase: SessionPhase, detail?: string): void {
    this.phase = phase
    this.listener.onPhaseChange?.(phase, detail)
  }
}
