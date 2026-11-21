export const MOBILE_PROTOCOL = 'axonkey.mobile/1' as const

export type TileMode = 'gesture' | 'hold'
export type TileGestureKind = 'tap' | 'double' | 'long'
export type TileAccent = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet'
export type PointerButtonName = 'left' | 'right' | 'middle'
export type PointerButtonPhase = 'down' | 'up'
export type TextCommitMode = 'paste' | 'type'

export type SessionPhase =
  | 'disconnected'
  | 'authenticating'
  | 'synchronizing'
  | 'active'
  | 'revoking'
  | 'closed'

export interface PairingOfferQr {
  v: 1
  hostId: string
  hostName: string
  addrs: string[]
  caCertDerB64: string
  pairToken: string
  expiresAtMs: number
}

export interface HostCapabilities {
  relativePointer: boolean
  textCommit: boolean
  audioPcm16: boolean
  platform: 'windows' | 'macos' | 'linux' | 'unknown'
}

export interface ForegroundContext {
  appId: string | null
  appName: string | null
  profileName: string
}

export type PageLayout = 'remote' | 'grid'

export interface MobileTile {
  id: string
  label: string
  subtitle?: string
  actionSummary?: string
  icon: string
  accent: TileAccent
  colSpan: 1 | 2
  mode: TileMode
  hasDoubleClick: boolean
  hasLongPress: boolean
}

export interface MobileDeckPage {
  id: string
  name: string
  layout?: PageLayout
  columns: 2 | 3 | 4
  tiles: MobileTile[]
}

export interface DeckSnapshot {
  version: 1
  activePageId: string
  trackpadSplit: number
  pointerSensitivity: number
  scrollSensitivity: number
  doubleClickWindowMs: number
  longPressWindowMs: number
  pages: MobileDeckPage[]
}

export interface DeckLayoutPatch {
  activePageId?: string
  trackpadSplit?: number
  pointerSensitivity?: number
  scrollSensitivity?: number
  pages?: MobileDeckPage[]
}

export type ClientMessage =
  | {
      type: 'pair.request'
      pairToken: string
      deviceName: string
    }
  | {
      type: 'client.auth'
      peerId: string
      peerToken: string
      deviceName: string
    }
  | {
      type: 'client.alive'
      sessionId: string
      leaseId: number
    }
  | {
      type: 'tile.activate'
      sessionId: string
      inputEpoch: number
      seq: number
      leaseId: number
      requestId: string
      tileId: string
      gesture: TileGestureKind
    }
  | {
      type: 'tile.hold.begin'
      sessionId: string
      inputEpoch: number
      seq: number
      leaseId: number
      requestId: string
      tileId: string
      pressId: string
    }
  | {
      type: 'tile.hold.end'
      sessionId: string
      inputEpoch: number
      seq: number
      leaseId: number
      requestId: string
      tileId: string
      pressId: string
    }
  | {
      type: 'pointer.motion'
      sessionId: string
      inputEpoch: number
      seq: number
      leaseId: number
      dx: number
      dy: number
    }
  | {
      type: 'pointer.scroll'
      sessionId: string
      inputEpoch: number
      seq: number
      leaseId: number
      x: number
      y: number
    }
  | {
      type: 'pointer.button'
      sessionId: string
      inputEpoch: number
      seq: number
      leaseId: number
      requestId: string
      button: PointerButtonName
      phase: PointerButtonPhase
      pressId: string
    }
  | {
      type: 'text.commit'
      sessionId: string
      inputEpoch: number
      seq: number
      leaseId: number
      requestId: string
      text: string
      mode: TextCommitMode
      submit: boolean
      contextRevision: number
    }
  | {
      type: 'deck.update'
      sessionId: string
      requestId: string
      baseRevision: number
      layoutPatch: DeckLayoutPatch
    }
  | {
      type: 'input.cancel'
      sessionId: string
      inputEpoch: number
      reason: string
    }
  | {
      type: 'audio.start'
      sessionId: string
      sampleRate: 16000
      channels: 1
    }
  | {
      type: 'audio.stop'
      sessionId: string
    }

export type ServerMessage =
  | {
      type: 'pair.result'
      ok: boolean
      peerId?: string
      peerToken?: string
      error?: string
    }
  | {
      type: 'server.ready'
      sessionId: string
      inputEpoch: number
      leaseId: number
      leaseTtlMs: number
      tickIntervalMs: number
      hostId: string
      hostName: string
      capabilities: HostCapabilities
      deckSnapshot: DeckSnapshot
      deckRevision: number
      context: ForegroundContext
      contextRevision: number
    }
  | {
      type: 'server.tick'
      sessionId: string
      inputEpoch: number
      leaseId: number
      leaseTtlMs: number
    }
  | {
      type: 'deck.snapshot'
      deckSnapshot: DeckSnapshot
      deckRevision: number
      inputEpoch: number
    }
  | {
      type: 'context.changed'
      context: ForegroundContext
      contextRevision: number
    }
  | {
      type: 'deck.update.result'
      requestId: string
      ok: boolean
      conflict?: boolean
      deckRevision: number
      deckSnapshot?: DeckSnapshot
      error?: string
    }
  | {
      type: 'command.result'
      requestId: string
      ok: boolean
      code?: string
      message?: string
    }
  | {
      type: 'session.revoked'
      sessionId: string
      reason: string
    }
  | {
      type: 'error'
      code: string
      message: string
    }
