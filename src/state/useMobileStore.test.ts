import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMobileStore } from './useMobileStore'
import { saveHostProfile, type AxonkeyAndroidBridge } from '../transport/nativeBridge'

describe('useMobileStore (v2 LAN Auto-Discovery & Live Telemetry)', () => {
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
      isDemoMode: false,
      phase: 'disconnected',
      hostId: null,
      connectingHostAddr: null,
    })

    // Initial connection tries the stale address
    useMobileStore.getState().connectSavedHost(staleHost)
    expect(connectUrls).toEqual(['wss://192.168.1.10:50123/ws'])
    expect(useMobileStore.getState().phase).toBe('authenticating')

    // UDP LAN discovery arrives with updated DHCP IP & ephemeral WSS port!
    useMobileStore.getState().applyDiscoveredHosts([
      {
        hostId: 'axonkey-pc-01',
        hostName: 'Home Workstation',
        port: 59876,
        addrs: ['192.168.1.88:59876'],
      },
    ])

    // Must immediately persist new address AND open WSS to the newly discovered endpoint!
    expect(connectUrls.at(-1)).toBe('wss://192.168.1.88:59876/ws')
    expect(useMobileStore.getState().savedHosts[0].addrs).toEqual(['192.168.1.88:59876'])
    expect(JSON.parse(savedCredentialsJson)[0].addrs).toEqual(['192.168.1.88:59876'])
  })

  it('wires native voice level & gyro guard callbacks into store state', () => {
    useMobileStore.getState().init()

    window.__axonkeyNativeOnVoiceLevel?.(0.76)
    expect(useMobileStore.getState().voiceLevel).toBeCloseTo(0.76)

    window.__axonkeyNativeOnVoiceLevel?.(2.5) // Clamped to 1.0
    expect(useMobileStore.getState().voiceLevel).toBe(1)

    window.__axonkeyNativeOnGyroState?.('vertical_guard')
    expect(useMobileStore.getState().gyroGuard?.kind).toBe('vertical_guard')

    useMobileStore.getState().clearGyroGuard()
    expect(useMobileStore.getState().gyroGuard).toBeNull()
  })
})
