import { create } from 'zustand'
import type {
  DeckLayoutPatch,
  DeckSnapshot,
  ForegroundContext,
  HostCapabilities,
  PairingOfferQr,
  SessionPhase,
  TextCommitMode,
} from '../protocol/types'
import { DEFAULT_DEMO_DECK } from '../transport/defaultDeck'
import {
  loadSavedHosts,
  removeHostProfile,
  saveHostProfile,
  setKeepScreenOn,
  triggerHaptic,
  type SavedHostProfile,
} from '../transport/nativeBridge'
import {
  DemoLoopbackTransport,
  MobileSessionClient,
  NativeWssTransport,
} from '../transport/sessionClient'

export type ViewMode = 'deck' | 'split' | 'trackpad'

export interface TileFeedback {
  status: 'ok' | 'error'
  at: number
}

export interface TextDeliveryBanner {
  status: 'sent' | 'ok' | 'error' | 'unknown'
  message?: string
}

interface MobileStoreState {
  phase: SessionPhase
  statusDetail: string
  hostName: string
  hostId: string | null
  isDemoMode: boolean
  capabilities: HostCapabilities | null
  deck: DeckSnapshot
  deckRevision: number
  context: ForegroundContext
  contextRevision: number
  savedHosts: SavedHostProfile[]
  viewMode: ViewMode
  editMode: boolean
  pairingOpen: boolean
  editingTileId: string | null
  conflictBanner: string | null
  errorToast: string | null
  tileFeedback: Record<string, TileFeedback>
  textDelivery: TextDeliveryBanner | null

  init: () => void
  connectDemo: () => void
  connectSavedHost: (host: SavedHostProfile) => void
  pairFromOffer: (offer: PairingOfferQr) => void
  forgetHost: (hostId: string) => void
  disconnect: () => void

  setViewMode: (mode: ViewMode) => void
  setActivePage: (pageId: string) => void
  setEditMode: (enabled: boolean) => void
  setPairingOpen: (open: boolean) => void
  setEditingTileId: (tileId: string | null) => void
  dismissConflict: () => void
  clearError: () => void

  submitDeckPatch: (patch: DeckLayoutPatch) => void
  sendText: (text: string, mode: TextCommitMode, submit: boolean) => boolean
  getClient: () => MobileSessionClient
}

const pendingTileReqMap = new Map<string, string>()

let singletonClient: MobileSessionClient | null = null

export const useMobileStore = create<MobileStoreState>((set, get) => {
  const ensureClient = (): MobileSessionClient => {
    if (singletonClient) return singletonClient
    singletonClient = new MobileSessionClient({
      onPhaseChange: (phase, detail) => {
        setKeepScreenOn(phase === 'active')
        set({ phase, statusDetail: detail ?? '' })
      },
      onPaired: (host) => {
        const nextHosts = saveHostProfile(host)
        set({ savedHosts: nextHosts, pairingOpen: false })
        triggerHaptic('confirm')
      },
      onReady: (payload) => {
        set({
          hostId: payload.hostId,
          hostName: payload.hostName,
          capabilities: payload.capabilities,
          deck: payload.deckSnapshot,
          deckRevision: payload.deckRevision,
          context: payload.context,
          contextRevision: payload.contextRevision,
          pairingOpen: false,
          conflictBanner: null,
          errorToast: null,
        })
        triggerHaptic('confirm')
      },
      onDeckUpdate: (snapshot, revision) => {
        set({ deck: snapshot, deckRevision: revision, conflictBanner: null })
      },
      onDeckConflict: (latestSnapshot, latestRevision, message) => {
        set({
          deck: latestSnapshot,
          deckRevision: latestRevision,
          conflictBanner: message,
        })
        triggerHaptic('error')
      },
      onContextChanged: (context, revision) => {
        set({ context, contextRevision: revision })
      },
      onCommandResult: (requestId, ok, _code, message) => {
        const tileId = pendingTileReqMap.get(requestId)
        if (tileId) {
          pendingTileReqMap.delete(requestId)
          if (!ok) triggerHaptic('error')
          set((s) => ({
            tileFeedback: {
              ...s.tileFeedback,
              [tileId]: { status: ok ? 'ok' : 'error', at: Date.now() },
            },
            errorToast: !ok && message ? message : s.errorToast,
          }))
        } else if (!ok && message) {
          set({ errorToast: message })
        }
      },
      onTextStatus: (_requestId, status, message) => {
        if (status === 'ok') triggerHaptic('confirm')
        if (status === 'error' || status === 'unknown') triggerHaptic('error')
        set({ textDelivery: { status, message } })
      },
      onError: (message) => {
        set({ errorToast: message })
      },
    })
    return singletonClient
  }

  return {
    phase: 'disconnected',
    statusDetail: '未连接桌面端',
    hostName: '未连接',
    hostId: null,
    isDemoMode: false,
    capabilities: null,
    deck: structuredClone(DEFAULT_DEMO_DECK),
    deckRevision: 1,
    context: { appId: null, appName: null, profileName: '默认配置' },
    contextRevision: 1,
    savedHosts: [],
    viewMode: 'split',
    editMode: false,
    pairingOpen: false,
    editingTileId: null,
    conflictBanner: null,
    errorToast: null,
    tileFeedback: {},
    textDelivery: null,

    init: () => {
      const hosts = loadSavedHosts()
      set({ savedHosts: hosts })
      const client = ensureClient()

      const onVis = () => {
        if (document.hidden) client.handleVisibilityHidden()
        else client.handleVisibilityVisible()
      }
      document.addEventListener('visibilitychange', onVis)
      window.__axonkeyNativeOnLifecycle = (state) => {
        if (state === 'paused') client.handleVisibilityHidden()
        else client.handleVisibilityVisible()
      }

      if (hosts.length > 0) {
        get().connectSavedHost(hosts[0])
      } else {
        // Start in Demo Mode so the user immediately experiences the Deck & Trackpad
        // and can tap the top-right pairing icon to scan a real Desktop QR.
        get().connectDemo()
      }
    },

    connectDemo: () => {
      const client = ensureClient()
      set({ isDemoMode: true, errorToast: null })
      client.connectToHost(
        {
          hostId: 'demo-desktop',
          hostName: 'Demo Desktop',
          addrs: ['demo'],
          caCertDerB64: '',
          peerId: 'demo-peer',
          peerToken: 'demo-token',
          lastConnectedAt: Date.now(),
        },
        () => new DemoLoopbackTransport(),
      )
    },

    connectSavedHost: (host) => {
      const client = ensureClient()
      set({ isDemoMode: false, errorToast: null })
      client.connectToHost(
        host,
        (h) => new NativeWssTransport(`wss://${h.addrs[0]}/ws`, h.hostId, h.caCertDerB64),
      )
    },

    pairFromOffer: (offer) => {
      const client = ensureClient()
      set({ isDemoMode: false, errorToast: null })
      const url = `wss://${offer.addrs[0]}/ws`
      client.connectWithPairing(
        offer,
        new NativeWssTransport(url, offer.hostId, offer.caCertDerB64),
      )
    },

    forgetHost: (hostId) => {
      const next = removeHostProfile(hostId)
      if (get().hostId === hostId) {
        ensureClient().disconnect('host_forgotten')
      }
      set({ savedHosts: next })
    },

    disconnect: () => {
      ensureClient().disconnect('user_disconnect')
      set({ isDemoMode: false })
    },

    setViewMode: (mode) => set({ viewMode: mode }),

    setActivePage: (pageId) => {
      const { deck } = get()
      if (deck.activePageId === pageId) return
      set({ deck: { ...deck, activePageId: pageId } })
      ensureClient().sendDeckUpdate(get().deckRevision, { activePageId: pageId })
    },

    setEditMode: (enabled) => set({ editMode: enabled, editingTileId: null }),
    setPairingOpen: (open) => set({ pairingOpen: open }),
    setEditingTileId: (tileId) => set({ editingTileId: tileId }),
    dismissConflict: () => set({ conflictBanner: null }),
    clearError: () => set({ errorToast: null }),

    submitDeckPatch: (patch) => {
      const { deckRevision } = get()
      ensureClient().sendDeckUpdate(deckRevision, patch)
    },

    sendText: (text, mode, submit) => {
      const reqId = ensureClient().sendTextCommit(text, mode, submit)
      return reqId !== null
    },

    getClient: () => ensureClient(),
  }
})

export function registerPendingTileRequest(requestId: string | null, tileId: string): void {
  if (requestId) {
    pendingTileReqMap.set(requestId, tileId)
  }
}
