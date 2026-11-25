import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMobileStore } from './useMobileStore'
import { saveHostProfile, type AxonkeyAndroidBridge } from '../transport/nativeBridge'

describe('useMobileStore (LAN Auto-Discovery, Live Telemetry & Contextual Edit State)', () => {
  let connectUrls: string[] = []
  let savedCredentialsJson = '[]'

  beforeEach(() => {
    connectUrls = []
    savedCredentialsJson = '[]'
    window.localStorage.clear()

    const mockNative: AxonkeyAndroidBridge = {
      haptic: vi.fn(),
      setKeepScreenOn: vi.fn(),
      openQrScanner: vi.fn(),
      connectWss: vi.fn((url: string) => {
        connectUrls.push(url)
      }),
      sendWssText: vi.fn(() => true),
      closeWss: vi.fn(),
      saveHostCredentials: vi.fn((json: string) => {
        savedCredentialsJson = json
      }),
      loadHostCredentials: vi.fn(() => savedCredentialsJson),
      deleteHostCredentials: vi.fn(),
      discoverLanHosts: vi.fn(),
      setGyroConfig: vi.fn(),
      setGyroClutch: vi.fn(),
    }
    window.AxonkeyNative = mockNative
    useMobileStore.getState().disconnect()
  })

  afterEach(() => {
    useMobileStore.getState().disconnect()
    delete window.AxonkeyNative
  })

  it('auto-updates saved host IP/port on UDP LAN discovery and immediately reconnects', () => {
    const staleHost = {
      hostId: 'axonkey-pc-01',
      hostName: 'Home Workstation',
      addrs: ['192.168.1.10:50123'],
      caCertDerB64: 'CERT_B64',
      peerId: 'peer-1',
      peerToken: 'token-1',
      lastConnectedAt: 1000,
    }
    const saved = saveHostProfile(staleHost)
    useMobileStore.setState({
      savedHosts: saved,
      phase: 'disconnected',
      hostId: null,
      connectingHostAddr: null,
    })

    useMobileStore.getState().connectSavedHost(staleHost)
    expect(connectUrls).toEqual(['wss://192.168.1.10:50123/ws'])
    expect(useMobileStore.getState().phase).toBe('authenticating')

    useMobileStore.getState().applyDiscoveredHosts([
      {
        hostId: 'axonkey-pc-01',
        hostName: 'Home Workstation',
        port: 59876,
        addrs: ['192.168.1.88:59876'],
      },
    ])

    expect(connectUrls.at(-1)).toBe('wss://192.168.1.88:59876/ws')
    expect(useMobileStore.getState().savedHosts[0].addrs).toEqual(['192.168.1.88:59876'])
    expect(JSON.parse(savedCredentialsJson)[0].addrs).toEqual(['192.168.1.88:59876'])
  })

  it('wires native voice level, gyro guard & Plan B theme system bar callbacks cleanly', () => {
    const setSystemBarThemeMock = vi.fn()
    window.AxonkeyNative!.setSystemBarTheme = setSystemBarThemeMock
    useMobileStore.getState().init()

    window.__axonkeyNativeOnVoiceLevel?.(0.76)
    expect(useMobileStore.getState().voiceLevel).toBeCloseTo(0.76)

    window.__axonkeyNativeOnVoiceLevel?.(2.5)
    expect(useMobileStore.getState().voiceLevel).toBe(1)

    window.__axonkeyNativeOnGyroState?.('vertical_guard')
    expect(useMobileStore.getState().gyroGuard?.kind).toBe('vertical_guard')

    useMobileStore.getState().clearGyroGuard()
    expect(useMobileStore.getState().gyroGuard).toBeNull()

    useMobileStore.getState().setThemeMode('system')
    window.__axonkeyNativeOnSystemDarkChanged?.(false)
    expect(useMobileStore.getState().effectiveTheme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(setSystemBarThemeMock).toHaveBeenLastCalledWith(false)

    window.__axonkeyNativeOnSystemDarkChanged?.(true)
    expect(useMobileStore.getState().effectiveTheme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(setSystemBarThemeMock).toHaveBeenLastCalledWith(true)
  })

  it('completes QR pairing cleanly without mobile preset wizard popups and manages contextual edit selection', () => {
    useMobileStore.setState({ pairingOpen: true, layoutEditing: false, selectedEditItem: null })

    useMobileStore.getState().pairFromOffer({
      v: 1,
      hostId: 'pc-new-1',
      hostName: 'New Studio PC',
      addrs: ['192.168.1.50:49670'],
      caCertDerB64: 'CERT',
      pairToken: '0123456789abcdef0123456789abcdef',
      expiresAtMs: Date.now() + 60_000,
    })

    window.__axonkeyNativeOnOpen?.()
    window.__axonkeyNativeOnMessage?.(
      JSON.stringify({
        type: 'pair.result',
        ok: true,
        peerId: 'peer-new',
        peerToken: 'token-new',
      }),
    )

    expect(useMobileStore.getState().pairingOpen).toBe(false)
    expect(useMobileStore.getState().savedHosts[0]?.hostId).toBe('pc-new-1')

    // Contextual edit mode selection & 1-tap setTileSpan
    useMobileStore.getState().setWorkspaceMode('deck')
    useMobileStore.getState().setLayoutEditing(true)
    expect(useMobileStore.getState().selectedEditItem).toBeNull()

    useMobileStore.getState().setSelectedEditItem({
      kind: 'tile',
      pageId: 'vibe-coding',
      zoneId: 'vibe-coding-grid',
      tileId: 'tile.continue',
    })
    useMobileStore.getState().setTileSpan('vibe-coding', 'tile.continue', 2, 2)
    const updatedTile = useMobileStore
      .getState()
      .deck.pages.find((p) => p.id === 'vibe-coding')
      ?.tiles.find((t) => t.id === 'tile.continue')
    expect(updatedTile?.colSpan).toBe(2)
    expect(updatedTile?.rowSpan).toBe(2)

    useMobileStore.getState().setLayoutEditing(false)
    expect(useMobileStore.getState().selectedEditItem).toBeNull()
  })
})
