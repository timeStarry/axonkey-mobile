export const MOBILE_PROTOCOL = 'axonkey.mobile/1' as const

export type TileMode = 'gesture' | 'hold'
export type TileGestureKind = 'tap' | 'double' | 'long'
export type TileAccent = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet'
export type PointerButtonName = 'left' | 'right' | 'middle'
export type PointerButtonPhase = 'down' | 'up'
export type TextCommitMode = 'paste' | 'type'
export type GyroMode = 'off' | 'relative' | 'absolute'
export type GyroGuardKind = 'vertical_guard' | 'out_of_bounds'

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

export interface DiscoveredLanHost {
  hostId: string
  hostName: string
  port: number
  addrs: string[]
}

export interface HostCapabilities {
  relativePointer: boolean
  absolutePointer?: boolean
  binaryPointerV1?: boolean
  binaryAudioV1?: boolean
  textCommit: boolean
  audioPcm16: boolean
  udpDiscoveryPort?: number
  platform: 'windows' | 'macos' | 'linux' | 'unknown'
  hostVersion?: string
  protocolApi?: number
  minRequiredClientApi?: number
  minRecommendedClientVersion?: string
}

export type VersionCompatSeverity = 'soft' | 'hard'
export type VersionCompatTarget = 'mobile' | 'desktop'

export interface VersionCompatibilityNotice {
  key: string
  occurrenceId?: number
  severity: VersionCompatSeverity
  target: VersionCompatTarget
  deviceName?: string
  currentVersion?: string | null
  expectedVersion: string
  title: string
  message: string
}

export interface ForegroundContext {
  appId: string | null
  appName: string | null
  profileName: string
}

export type PageLayout = 'remote' | 'grid'
export type DeckZoneKind = 'bento-grid' | 'dpad-3x3' | 'pointer-pad' | 'gesture-pad'
export type EmbeddedPointerMode = 'trackpad' | 'relative'
export type EmbeddedPadHeight = 'compact' | 'standard' | 'tall'

export type SystemTouchpadGesture =
  | 'three_finger_up'
  | 'three_finger_down'
  | 'three_finger_left'
  | 'three_finger_right'
  | 'three_finger_tap'

export type StarterPresetId =
  | 'daily-remote'
  | 'vibe-coding'
  | 'presentation-media'
  | 'blank-canvas'

export type VoicePresetKind = 'doubao-alt' | 'system-win-h' | 'ctrl-win' | 'pure-mic'

export type VolumeKeyMouseMode = 'off' | 'lr' | 'rl' | 'scroll'
export type ScreenOrientationMode = 'portrait' | 'landscape' | 'system'
export type AirMouseHandedness = 'right' | 'left'

export interface MobileTile {
  id: string
  label: string
  subtitle?: string
  actionSummary?: string
  icon: string
  accent: TileAccent
  colSpan: 1 | 2
  rowSpan?: 1 | 2
  mode: TileMode
  hasDoubleClick?: boolean
  hasLongPress?: boolean
}

export interface MobileDeckZone {
  id: string
  kind: DeckZoneKind
  /** For 'bento-grid': 2, 3, or 4 columns (default page.columns || 3) */
  columns?: 2 | 3 | 4
  /** For 'pointer-pad': embedded pointer sub-mode ('trackpad' | 'relative') */
  pointerMode?: EmbeddedPointerMode
  /** Optional height preset for embedded 'pointer-pad' or 'gesture-pad' */
  padHeight?: EmbeddedPadHeight
  /** When false on 'pointer-pad', hides the bottom Left/Scroll/Right button strip (default true) */
  showButtons?: boolean
  /**
   * Ordered tile IDs rendered inside this zone.
   * - 'bento-grid': variable length
   * - 'dpad-3x3': up to 9 slot IDs [topLeft, up, topRight, left, ok, right, bottomLeft, down, bottomRight]
   * - 'gesture-pad': up to 6 slot IDs [up, down, left, right, tap, double]
   * (empty string "" allowed for blank slot).
   */
  tileIds: string[]
}

export interface MobileDeckPage {
  id: string
  name: string
  layout?: PageLayout
  columns: 2 | 3 | 4
  tiles: MobileTile[]
  zones?: MobileDeckZone[]
}

export interface DeckSnapshot {
  version: 1
  activePageId: string
  trackpadSplit: number
  pointerSensitivity: number
  scrollSensitivity: number
  doubleClickWindowMs: number
  longPressWindowMs: number
  voiceBindingSummary?: string | null
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
      clientVersion?: string
      protocolApi?: number
      minRequiredHostApi?: number
      minRecommendedHostVersion?: string
    }
  | {
      type: 'client.auth'
      peerId: string
      peerToken: string
      deviceName: string
      clientVersion?: string
      protocolApi?: number
      minRequiredHostApi?: number
      minRecommendedHostVersion?: string
    }
  | {
      type: 'client.alive'
      sessionId: string
      leaseId: number
    }
  | {
      type: 'client.rename'
      sessionId: string
      deviceName: string
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
      type: 'touchpad.gesture'
      sessionId: string
      inputEpoch: number
      seq: number
      leaseId: number
      gesture: SystemTouchpadGesture
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
      type: 'deck.apply_preset'
      sessionId: string
      requestId: string
      preset: StarterPresetId
      voicePreset?: VoicePresetKind
    }
  | {
      type: 'input.cancel'
      sessionId: string
      inputEpoch: number
      reason: string
    }
  | {
      type: 'voice.begin'
      sessionId: string
      inputEpoch: number
      inputGeneration: number
      seq: number
      leaseId: number
      requestId: string
      streamId: number
    }
  | {
      type: 'voice.end'
      sessionId: string
      inputEpoch: number
      inputGeneration: number
      seq: number
      requestId: string
      streamId: number
      finalSampleExclusive: number
    }
  | {
      type: 'voice.cancel'
      sessionId: string
      inputEpoch: number
      streamId: number
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
      versionNotice?: VersionCompatibilityNotice
    }
  | {
      type: 'server.ready'
      sessionId: string
      inputEpoch: number
      inputGeneration?: number
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
      inputGeneration?: number
      leaseId: number
      leaseTtlMs: number
    }
  | {
      type: 'deck.snapshot'
      deckSnapshot: DeckSnapshot
      deckRevision: number
      inputEpoch: number
      inputGeneration?: number
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
      versionNotice?: VersionCompatibilityNotice
    }
