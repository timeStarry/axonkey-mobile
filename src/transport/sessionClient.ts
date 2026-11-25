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
  type SystemTouchpadGesture,
  type TextCommitMode,
  type TileGestureKind,
  type VersionCompatibilityNotice,
} from '../protocol/types'
import {
  buildClientVersionHandshake,
  evaluateHostCapabilitiesCompatibility,
  normalizeServerErrorCompatibilityNotice,
} from '../protocol/versionCompat'
import {
  cancelNativeVoiceStream,
  clearNativeSessionAuth,
  flushNativePointerDelta,
  hasNativeBinaryPointer,
  hasNativeControlArbiter,
  hasNativeVoiceStream,
  isNativeShell,
  sendNativeControlFrame,
  sendNativePointerDelta,
  startNativeAudioCapture,
  startNativeVoiceStream,
  stopNativeAudioCapture,
  stopNativeVoiceStream,
  syncNativeSessionAuth,
  type SavedHostProfile,
} from './nativeBridge'

export interface TransportAdapter {
  readonly usesNativeArbiter?: boolean
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
    inputGeneration: number
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
  onTextStatus?: (
    requestId: string,
    status: 'sent' | 'ok' | 'error' | 'unknown',
    message?: string,
  ) => void
  onVersionNotice?: (notice: VersionCompatibilityNotice | null) => void
  onError?: (message: string) => void
}

const BACKOFF_MS = [150, 300, 600, 1500]

export class NativeWssTransport implements TransportAdapter {
  readonly usesNativeArbiter = true
  private fallbackWs: WebSocket | null = null

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

export class MobileSessionClient {
  private phase: SessionPhase = 'disconnected'
  private transport: TransportAdapter | null = null
  private sessionId: string | null = null
  private inputEpoch = 0
  private inputGeneration = 0
  private seq = 0
  private leaseId = 0
  private leaseExpiresAtMs = 0
  private contextRevision = 0
  private capabilities: HostCapabilities | null = null

  private pendingTextRequests = new Set<string>()
  private inFlightDeckRequestId: string | null = null
  private queuedDeckPatch: DeckLayoutPatch | null = null

  private activeVoiceStreamId: number | null = null
  private activeVoiceUsesNative = false
  private activeVoiceUsesLegacy = false
  private localVoiceCounter = 0

  private activeHost: SavedHostProfile | null = null
  private pendingPairOffer: PairingOfferQr | null = null
  private transportFactory:
    | ((host: SavedHostProfile, attempt: number) => TransportAdapter)
    | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private allowAutoReconnect = true
  private readonly now: () => number
  private reqCounter = 1

  constructor(
    private readonly listener: SessionListener,
    private deviceName = 'Axonkey 手机遥控',
    now?: () => number,
  ) {
    this.now = now ?? (() => Date.now())
  }

  getDeviceName(): string {
    return this.deviceName
  }

  setDeviceName(nextName: string): void {
    const cleaned = nextName.trim().slice(0, 48) || 'Axonkey 手机遥控'
    if (cleaned === this.deviceName) return
    this.deviceName = cleaned
    if (this.phase === 'active' && this.sessionId) {
      this.sendRaw({
        type: 'client.rename',
        sessionId: this.sessionId,
        deviceName: this.deviceName,
      })
    }
  }

  getPhase(): SessionPhase {
    return this.phase
  }

  getInputGeneration(): number {
    return this.inputGeneration
  }

  isVoiceActive(): boolean {
    return this.activeVoiceStreamId !== null
  }

  isInputReady(): boolean {
    return (
      this.phase === 'active' &&
      this.sessionId !== null &&
      this.now() <= this.leaseExpiresAtMs
    )
  }

  connectWithPairing(
    offer: PairingOfferQr,
    transport: TransportAdapter,
    reconnectFactory?: (host: SavedHostProfile, attempt: number) => TransportAdapter,
  ): void {
    this.disconnect('switch_to_pair')
    this.pendingPairOffer = offer
    this.transportFactory = reconnectFactory ?? null
    this.allowAutoReconnect = false
    this.setPhase('authenticating', '正在配对…')
    this.attachTransport(transport, () => {
      this.sendRaw({
        type: 'pair.request',
        pairToken: offer.pairToken,
        deviceName: this.deviceName,
        ...buildClientVersionHandshake(),
      })
    })
  }

  connectToHost(
    host: SavedHostProfile,
    factory: (host: SavedHostProfile, attempt: number) => TransportAdapter,
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
    this.abortActiveVoiceIfNeeded(reason)
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
    clearNativeSessionAuth()
    this.markPendingTextsUnknown()
    this.transport?.close(reason)
    this.transport = null
    this.sessionId = null
    this.inputGeneration = 0
    this.capabilities = null
    this.leaseExpiresAtMs = 0
    this.setPhase('disconnected')
  }

  handleVisibilityHidden(): void {
    this.abortActiveVoiceIfNeeded('paused')
    if (this.phase === 'active' && this.sessionId) {
      this.sendRaw({
        type: 'input.cancel',
        sessionId: this.sessionId,
        inputEpoch: this.inputEpoch,
        reason: 'app_backgrounded',
      })
      clearNativeSessionAuth()
      this.leaseExpiresAtMs = 0
      this.setPhase('revoking', '应用切至后台，已暂停输入')
      this.transport?.close('app_backgrounded')
      this.transport = null
      this.sessionId = null
      this.inputGeneration = 0
      this.capabilities = null
      this.setPhase('disconnected', '回到前台将自动重连')
    } else {
      clearNativeSessionAuth()
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

  flushPointerMotion(): void {
    if (this.canUseNativeBinaryPointer()) {
      flushNativePointerDelta()
    }
  }

  sendTileActivate(tileId: string, gesture: TileGestureKind): string | null {
    if (!this.isInputReady() || !this.sessionId) return null
    const requestId = this.nextRequestId('tile')
    const ok = this.sendSequenced({
      type: 'tile.activate',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: 0,
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
    const ok = this.sendSequenced({
      type: begin ? 'tile.hold.begin' : 'tile.hold.end',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: 0,
      leaseId: this.leaseId,
      requestId,
      tileId,
      pressId,
    })
    return ok ? requestId : null
  }

  sendPointerMotion(dx: number, dy: number): boolean {
    if (!this.isInputReady() || !this.sessionId) return false
    if (dx === 0 && dy === 0) return true
    if (this.canUseNativeBinaryPointer()) {
      return sendNativePointerDelta(dx, dy)
    }
    return this.sendSequenced({
      type: 'pointer.motion',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: 0,
      leaseId: this.leaseId,
      dx,
      dy,
    })
  }

  sendPointerScroll(x: number, y: number): boolean {
    if (!this.isInputReady() || !this.sessionId) return false
    if (x === 0 && y === 0) return true
    return this.sendSequenced({
      type: 'pointer.scroll',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: 0,
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
    // Flush any queued binary pointer delta BEFORE button edge so movement never reorders across click/drag!
    this.flushPointerMotion()
    const requestId = this.nextRequestId('btn')
    const ok = this.sendSequenced({
      type: 'pointer.button',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: 0,
      leaseId: this.leaseId,
      requestId,
      button,
      phase,
      pressId,
    })
    return ok ? requestId : null
  }

  sendTouchpadGesture(gesture: SystemTouchpadGesture): boolean {
    if (!this.isInputReady() || !this.sessionId) return false
    this.flushPointerMotion()
    return this.sendSequenced({
      type: 'touchpad.gesture',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: 0,
      leaseId: this.leaseId,
      gesture,
    })
  }

  sendTextCommit(text: string, mode: TextCommitMode, submit: boolean): string | null {
    if (!this.isInputReady() || !this.sessionId || !text.trim()) return null
    const requestId = this.nextRequestId('txt')
    const ok = this.sendSequenced({
      type: 'text.commit',
      sessionId: this.sessionId,
      inputEpoch: this.inputEpoch,
      seq: 0,
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
    if (this.inFlightDeckRequestId !== null) {
      this.queuedDeckPatch = {
        ...this.queuedDeckPatch,
        ...layoutPatch,
      }
      return this.inFlightDeckRequestId
    }
    const requestId = this.nextRequestId('deck')
    const ok = this.sendRaw({
      type: 'deck.update',
      sessionId: this.sessionId,
      requestId,
      baseRevision,
      layoutPatch,
    })
    if (!ok) return null
    this.inFlightDeckRequestId = requestId
    return requestId
  }

  startVoiceStream(): boolean {
    if (!this.isInputReady() || !this.sessionId) return false
    if (this.activeVoiceStreamId !== null) return true

    const requestId = this.nextRequestId('voice')

    // Path A: Native Android AKA1 binary audio + voice.begin under single sendLock
    if (
      this.usesNativeArbiter() &&
      hasNativeVoiceStream() &&
      this.capabilities?.binaryAudioV1 !== false
    ) {
      this.syncNativeAuth()
      const streamId = startNativeVoiceStream(requestId)
      if (streamId > 0) {
        this.activeVoiceStreamId = streamId
        this.activeVoiceUsesNative = true
        this.activeVoiceUsesLegacy = false
        return true
      }
      return false
    }

    // Path B: Protocol v2 JSON voice.begin (Browser / Non-Native Fallback)
    if (this.capabilities?.binaryAudioV1) {
      const streamId = ++this.localVoiceCounter
      const ok = this.sendSequenced({
        type: 'voice.begin',
        sessionId: this.sessionId,
        inputEpoch: this.inputEpoch,
        inputGeneration: this.inputGeneration || 1,
        seq: 0,
        leaseId: this.leaseId,
        requestId,
        streamId,
      })
      if (!ok) return false
      this.activeVoiceStreamId = streamId
      this.activeVoiceUsesNative = false
      this.activeVoiceUsesLegacy = false
      return true
    }

    // Path C: Legacy v1 host fallback
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
    this.activeVoiceStreamId = ++this.localVoiceCounter
    this.activeVoiceUsesNative = false
    this.activeVoiceUsesLegacy = true
    return true
  }

  stopVoiceStream(): void {
    if (this.activeVoiceStreamId === null) return
    const streamId = this.activeVoiceStreamId
    const usedNative = this.activeVoiceUsesNative
    const usedLegacy = this.activeVoiceUsesLegacy
    this.activeVoiceStreamId = null
    this.activeVoiceUsesNative = false
    this.activeVoiceUsesLegacy = false

    if (usedNative) {
      stopNativeVoiceStream(streamId, this.nextRequestId('voice-end'))
      return
    }

    if (usedLegacy) {
      stopNativeAudioCapture()
      if (this.sessionId && this.phase === 'active') {
        this.sendRaw({ type: 'audio.stop', sessionId: this.sessionId })
      }
      return
    }

    if (this.sessionId && this.phase === 'active') {
      this.sendSequenced({
        type: 'voice.end',
        sessionId: this.sessionId,
        inputEpoch: this.inputEpoch,
        inputGeneration: this.inputGeneration || 1,
        seq: 0,
        requestId: this.nextRequestId('voice-end'),
        streamId,
        finalSampleExclusive: 0,
      })
    }
  }

  cancelVoiceStream(reason = 'cancelled'): void {
    this.abortActiveVoiceIfNeeded(reason)
  }

  private abortActiveVoiceIfNeeded(reason: string): void {
    if (this.activeVoiceStreamId === null) {
      stopNativeAudioCapture()
      return
    }
    const streamId = this.activeVoiceStreamId
    const usedNative = this.activeVoiceUsesNative
    const usedLegacy = this.activeVoiceUsesLegacy
    this.activeVoiceStreamId = null
    this.activeVoiceUsesNative = false
    this.activeVoiceUsesLegacy = false

    if (usedNative) {
      cancelNativeVoiceStream(streamId, reason)
      return
    }

    if (usedLegacy) {
      stopNativeAudioCapture()
      if (this.sessionId && this.phase === 'active') {
        this.sendRaw({ type: 'audio.stop', sessionId: this.sessionId })
      }
      return
    }

    if (this.sessionId && this.phase === 'active') {
      this.sendRaw({
        type: 'voice.cancel',
        sessionId: this.sessionId,
        inputEpoch: this.inputEpoch,
        streamId,
        reason,
      })
    }
  }

  private usesNativeArbiter(): boolean {
    return Boolean(this.transport?.usesNativeArbiter) && hasNativeControlArbiter()
  }

  private canUseNativeBinaryPointer(): boolean {
    return (
      Boolean(this.transport?.usesNativeArbiter) &&
      hasNativeBinaryPointer() &&
      Boolean(this.capabilities?.binaryPointerV1)
    )
  }

  private syncNativeAuth(): void {
    if (!this.sessionId || this.phase !== 'active' || !this.transport?.usesNativeArbiter) {
      clearNativeSessionAuth()
      return
    }
    syncNativeSessionAuth(
      this.sessionId,
      this.inputEpoch,
      this.inputGeneration,
      this.leaseId,
    )
  }

  private openHostConnection(): void {
    if (!this.activeHost || !this.transportFactory) return
    const host = this.activeHost
    this.setPhase('authenticating', `正在连接 ${host.hostName}…`)
    const adapter = this.transportFactory(host, this.reconnectAttempt)
    this.attachTransport(adapter, () => {
      this.setPhase('synchronizing', '正在同步配置…')
      this.sendRaw({
        type: 'client.auth',
        peerId: host.peerId,
        peerToken: host.peerToken,
        deviceName: this.deviceName,
        ...buildClientVersionHandshake(),
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
            ...buildClientVersionHandshake(),
          })
        } else if (msg.versionNotice) {
          this.allowAutoReconnect = false
          this.disconnect('pair_version_incompatible')
          this.listener.onVersionNotice?.(msg.versionNotice)
        } else {
          this.listener.onError?.(msg.error ?? '配对失败')
          this.disconnect('pair_failed')
        }
        break
      }
      case 'server.ready': {
        const compat = evaluateHostCapabilitiesCompatibility({
          hostName: msg.hostName,
          capabilities: msg.capabilities,
        })
        if (compat?.severity === 'hard') {
          this.allowAutoReconnect = false
          this.disconnect('version_incompatible')
          this.listener.onVersionNotice?.(compat)
          break
        }
        this.sessionId = msg.sessionId
        this.inputEpoch = msg.inputEpoch
        this.inputGeneration = msg.inputGeneration ?? 1
        this.seq = 0
        this.leaseId = msg.leaseId
        this.leaseExpiresAtMs = this.now() + msg.leaseTtlMs
        this.capabilities = msg.capabilities
        this.contextRevision = msg.contextRevision
        this.reconnectAttempt = 0
        this.setPhase('active')
        this.syncNativeAuth()
        this.listener.onReady?.({
          hostId: msg.hostId,
          hostName: msg.hostName,
          inputGeneration: this.inputGeneration,
          capabilities: msg.capabilities,
          deckSnapshot: msg.deckSnapshot,
          deckRevision: msg.deckRevision,
          context: msg.context,
          contextRevision: msg.contextRevision,
        })
        this.listener.onVersionNotice?.(compat)
        break
      }
      case 'server.tick': {
        if (msg.sessionId !== this.sessionId || msg.inputEpoch !== this.inputEpoch) return
        this.leaseId = msg.leaseId
        if (msg.inputGeneration !== undefined) {
          this.inputGeneration = msg.inputGeneration
        }
        this.leaseExpiresAtMs = this.now() + msg.leaseTtlMs
        this.syncNativeAuth()
        this.sendRaw({
          type: 'client.alive',
          sessionId: this.sessionId,
          leaseId: this.leaseId,
        })
        break
      }
      case 'deck.snapshot': {
        this.inputEpoch = msg.inputEpoch
        if (msg.inputGeneration !== undefined) {
          this.inputGeneration = msg.inputGeneration
        }
        this.syncNativeAuth()
        this.listener.onDeckUpdate?.(msg.deckSnapshot, msg.deckRevision)
        break
      }
      case 'context.changed': {
        this.contextRevision = msg.contextRevision
        this.listener.onContextChanged?.(msg.context, msg.contextRevision)
        break
      }
      case 'deck.update.result': {
        if (this.inFlightDeckRequestId === msg.requestId) {
          this.inFlightDeckRequestId = null
        }
        if (msg.ok && msg.deckSnapshot) {
          if (this.queuedDeckPatch && this.sessionId && this.phase === 'active') {
            const nextPatch = this.queuedDeckPatch
            this.queuedDeckPatch = null
            this.sendDeckUpdate(msg.deckRevision, nextPatch)
          } else {
            this.listener.onDeckUpdate?.(msg.deckSnapshot, msg.deckRevision)
          }
        } else if (msg.conflict && msg.deckSnapshot) {
          this.queuedDeckPatch = null
          this.listener.onDeckConflict?.(
            msg.deckSnapshot,
            msg.deckRevision,
            msg.error ?? '配置已被其他端更新',
          )
        } else {
          this.queuedDeckPatch = null
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
        this.abortActiveVoiceIfNeeded('session_revoked')
        this.allowAutoReconnect = false
        clearNativeSessionAuth()
        this.markPendingTextsUnknown()
        this.sessionId = null
        this.inputGeneration = 0
        this.capabilities = null
        this.leaseExpiresAtMs = 0
        this.setPhase('closed', `会话已撤销 (${msg.reason})`)
        this.transport?.close('revoked')
        this.transport = null
        break
      }
      case 'error': {
        const compat = normalizeServerErrorCompatibilityNotice(
          msg.code,
          msg.message,
          msg.versionNotice,
        )
        if (compat) {
          this.allowAutoReconnect = false
          this.disconnect('version_incompatible')
          this.listener.onVersionNotice?.(compat)
          break
        }
        this.listener.onError?.(msg.message)
        break
      }
    }
  }

  private handleTransportClosed(reason: string): void {
    this.activeVoiceStreamId = null
    this.activeVoiceUsesNative = false
    this.activeVoiceUsesLegacy = false
    clearNativeSessionAuth()
    this.markPendingTextsUnknown()
    this.sessionId = null
    this.inputGeneration = 0
    this.capabilities = null
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
    this.inFlightDeckRequestId = null
    this.queuedDeckPatch = null
    for (const reqId of this.pendingTextRequests) {
      this.listener.onTextStatus?.(reqId, 'unknown', '连接中断，发送结果未知（未自动重发）')
    }
    this.pendingTextRequests.clear()
  }

  private sendSequenced<T extends ClientMessage & { seq: number }>(msg: T): boolean {
    if (!this.transport) return false
    if (this.usesNativeArbiter()) {
      const payload: T = { ...msg, seq: 0 }
      return sendNativeControlFrame(JSON.stringify(payload))
    }
    const payload: T = { ...msg, seq: ++this.seq }
    return this.transport.send(JSON.stringify(payload))
  }

  private sendRaw(msg: ClientMessage): boolean {
    if (!this.transport) return false
    if (this.usesNativeArbiter()) {
      return sendNativeControlFrame(JSON.stringify(msg))
    }
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
