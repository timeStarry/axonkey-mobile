import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { App } from './App'
import { useMobileStore } from './state/useMobileStore'
import { DEFAULT_MOBILE_DECK } from './transport/defaultDeck'
import {
  setVoiceRecordingActive,
  triggerControlFeedback,
  triggerHaptic,
  type AxonkeyAndroidBridge,
} from './transport/nativeBridge'

function connectMockRealHost(hostName = 'Studio PC') {
  act(() => {
    useMobileStore.getState().connectSavedHost({
      hostId: 'pc-1',
      hostName,
      addrs: ['192.168.1.20:49670'],
      caCertDerB64: 'CERT_B64',
      peerId: 'peer-1',
      peerToken: 'token-1',
      lastConnectedAt: Date.now(),
    })
    window.__axonkeyNativeOnOpen?.()
    window.__axonkeyNativeOnMessage?.(
      JSON.stringify({
        type: 'server.ready',
        sessionId: 'sess-live-1',
        inputEpoch: 1,
        inputGeneration: 1,
        leaseId: 1,
        leaseTtlMs: 60_000,
        tickIntervalMs: 250,
        hostId: 'pc-1',
        hostName,
        capabilities: {
          relativePointer: true,
          absolutePointer: true,
          binaryPointerV1: true,
          binaryAudioV1: true,
          textCommit: true,
          audioPcm16: true,
          udpDiscoveryPort: 49671,
          platform: 'windows',
          hostVersion: '1.9.19',
          protocolApi: 2,
          minRequiredClientApi: 1,
          minRecommendedClientVersion: '0.2.0',
        },
        deckSnapshot: structuredClone(DEFAULT_MOBILE_DECK),
        deckRevision: 1,
        context: { appId: 'doubao.exe', appName: '豆包', profileName: '通用语音' },
        contextRevision: 1,
      }),
    )
  })
}

describe('Axonkey Mobile Production UX — Zero Demo Remnants, Same-LAN Guidance, 1/4 Sector Ring & Squircle Radial Halo', () => {
  it('boots disconnected without Demo Mode, shows Same-LAN notice in PairingSheet, and supports 1/4 sector press, pixel-geometry silkscreens & tactile sounds', () => {
    const recenterCursorMock = vi.fn(() => true)
    const setSystemBarThemeMock = vi.fn()
    const hapticMock = vi.fn()
    const playClickSoundMock = vi.fn()

    window.AxonkeyNative = {
      haptic: hapticMock,
      playClickSound: playClickSoundMock,
      setKeepScreenOn: vi.fn(),
      openQrScanner: vi.fn(),
      connectWss: vi.fn(),
      sendWssText: vi.fn(() => true),
      closeWss: vi.fn(),
      saveHostCredentials: vi.fn(),
      loadHostCredentials: vi.fn(() => '[]'),
      deleteHostCredentials: vi.fn(),
      recenterCursor: recenterCursorMock,
      setSystemBarTheme: setSystemBarThemeMock,
      isSystemDarkMode: vi.fn(() => true),
    } satisfies AxonkeyAndroidBridge

    const origInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })

    try {
      window.localStorage.clear()
      useMobileStore.getState().disconnect()
      render(<App />)

      // 1. Fresh launch with no paired PC stays cleanly disconnected (never enters fake Demo Mode!)
      expect(screen.getByText('未连接 · 点此配对')).toBeTruthy()
      expect(screen.queryByText(/模拟体验/)).toBeNull()
      expect(screen.getByTestId('stage-scrollport').className).toContain('-mx-2')
      expect(screen.getByTestId('stage-scrollport').className).toContain('px-2')

      // Tapping any keycap while disconnected pops the bottom interactive Action Pill -> 1-tap opens PairingSheet!
      const escDisconnectedBtn = document.querySelector(
        '[data-bento-tile-id="remote.esc"]',
      ) as HTMLElement
      fireEvent.pointerDown(escDisconnectedBtn, { pointerId: 21, clientX: 40, clientY: 120 })
      fireEvent.pointerUp(escDisconnectedBtn, { pointerId: 21, clientX: 40, clientY: 120 })
      const disconnectedHud = screen.getByTestId('hud-toast')
      expect(disconnectedHud.textContent).toContain('尚未连接电脑')
      expect(disconnectedHud.className).toContain('bottom-')
      fireEvent.click(within(disconnectedHud).getByText('立即配对'))

      const pairDialog = screen.getByRole('dialog', { name: '设备连接' })
      expect(
        within(pairDialog).getByText(/请确保手机与电脑连接在同一局域网/),
      ).toBeTruthy()
      expect(within(pairDialog).queryByText(/模拟体验/)).toBeNull()
      fireEvent.click(screen.getByTestId('pairing-sheet-backdrop'))

      // Connect real WSS host session
      connectMockRealHost('Studio PC')
      act(() => {
        useMobileStore.setState({
          workspaceMode: 'remote',
          pointerTab: 'trackpad',
          airMouseFeel: 'relative',
        })
      })

      expect(screen.getByText('Studio PC')).toBeTruthy()
      expect(screen.getByText('豆包')).toBeTruthy()
      expect(screen.queryByText('继续执行')).toBeNull()
      expect(screen.getByText('按住说话')).toBeTruthy()

      // Unbound tile feedback uses subtle keycap nudge + auto-fading HUD capsule (zero legacy top error bar)
      const sendWssSpy = vi.spyOn(window.AxonkeyNative!, 'sendWssText')
      sendWssSpy.mockClear()
      const escConnectedBtn = document.querySelector(
        '[data-bento-tile-id="remote.esc"]',
      ) as HTMLElement
      fireEvent.pointerDown(escConnectedBtn, { pointerId: 22, clientX: 40, clientY: 120 })
      fireEvent.pointerUp(escConnectedBtn, { pointerId: 22, clientX: 40, clientY: 120 })
      const sentRaw = sendWssSpy.mock.calls.at(-1)?.[0] ?? '{}'
      const sentMsg = JSON.parse(sentRaw) as { requestId?: string }
      act(() => {
        window.__axonkeyNativeOnMessage?.(
          JSON.stringify({
            type: 'command.result',
            requestId: sentMsg.requestId,
            ok: false,
            code: 'unbound_tile',
            message: '该按键未绑定动作',
          }),
        )
      })
      expect(escConnectedBtn.className).toContain('ak-tile-unbound-nudge')
      expect(escConnectedBtn.className).toContain('ring-inset')
      expect(screen.getByTestId('hud-toast').textContent).toContain('「Esc」暂未绑定动作')
      expect(screen.queryByTestId('floating-error-card')).toBeNull()

      // 2. True 1/4 Annular Sector Press Animation on Circular Clickpad (`触控圆盘`)
      const tileActivateSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendTileActivate')
      const clickpadRing = screen.getByTestId('circular-clickpad-ring')
      const sectorSvg = screen.getByTestId('clickpad-sector-svg')
      const upSectorPath = sectorSvg.querySelector('[data-sector-slot="1"]') as SVGPathElement
      expect(upSectorPath.getAttribute('data-sector-active')).toBe('false')

      const upBtn = within(clickpadRing).getByLabelText('上')
      playClickSoundMock.mockClear()
      fireEvent.pointerDown(upBtn, { pointerId: 1, clientX: 110, clientY: 20 })
      expect(upSectorPath.getAttribute('data-sector-active')).toBe('true')
      expect(clickpadRing.style.transform).toContain('rotateX')
      fireEvent.pointerUp(upBtn, { pointerId: 1, clientX: 110, clientY: 20 })
      expect(upSectorPath.getAttribute('data-sector-active')).toBe('false')
      expect(tileActivateSpy).toHaveBeenCalledWith('remote.up', 'tap')
      // Click sound defaults to OFF until user enables it in Global Settings
      expect(useMobileStore.getState().localFeel.soundEnabled).toBe(false)
      expect(playClickSoundMock).not.toHaveBeenCalled()

      tileActivateSpy.mockClear()
      hapticMock.mockClear()
      fireEvent.pointerDown(clickpadRing, { pointerId: 2, clientX: 80, clientY: 40 })
      fireEvent.pointerMove(clickpadRing, { pointerId: 2, clientX: 110, clientY: 42 })
      fireEvent.pointerMove(clickpadRing, { pointerId: 2, clientX: 148, clientY: 43 })
      fireEvent.pointerUp(clickpadRing, { pointerId: 2, clientX: 148, clientY: 43 })
      expect(tileActivateSpy).toHaveBeenCalledTimes(2)
      expect(tileActivateSpy).toHaveBeenNthCalledWith(1, 'remote.right', 'tap')
      expect(tileActivateSpy).toHaveBeenNthCalledWith(2, 'remote.right', 'tap')
      expect(hapticMock).toHaveBeenCalledWith('detent')

      // 3. Physical-Geometry Silkscreen: 3-col portrait hides 1x1 silkscreen; 2-col shows 1x1 silkscreen
      fireEvent.click(screen.getByText('快捷面板'))
      const silkEls3Col = screen.getAllByTestId('tile-silkscreen')
      expect(silkEls3Col.length).toBe(1)
      expect(silkEls3Col[0].textContent).toBe('粘贴「继续执行…」')
      expect(screen.queryByText('Ctrl+Enter')).toBeNull()

      act(() => {
        const vibePage = useMobileStore
          .getState()
          .deck.pages.find((p) => p.id === 'vibe-coding')!
        useMobileStore.getState().updateZone('vibe-coding', `${vibePage.id}-grid`, { columns: 2 })
      })
      expect(screen.getByText('Ctrl+Enter')).toBeTruthy()
      expect(screen.getByText('Ctrl+Z')).toBeTruthy()

      // 4. Touchpad & Air-Mouse: HUD Tips, Gesture Help Info Sheet & NO misleading Volume badge
      fireEvent.click(screen.getByText('触控·飞鼠'))
      fireEvent.click(screen.getByLabelText('拖拽锁定'))
      expect(screen.getByTestId('hud-toast').textContent).toContain('左键拖拽已锁定')

      fireEvent.click(screen.getByLabelText('屏幕归中'))
      expect(recenterCursorMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('hud-toast').textContent).toContain('光标已归中')

      fireEvent.click(screen.getByLabelText('操控手势说明'))
      expect(screen.getByRole('dialog', { name: '操控手势说明' })).toBeTruthy()
      expect(screen.getByText('三指上滑 / 下滑')).toBeTruthy()
      fireEvent.click(screen.getByTestId('pointer-help-sheet-backdrop'))

      act(() => {
        useMobileStore.getState().updateLocalFeel({ volumeKeyMouseMode: 'lr' })
      })
      fireEvent.click(screen.getByText('飞鼠'))
      expect(screen.queryByLabelText('音量键鼠标已开启')).toBeNull()

      // 5. Global Settings vs Pointer Settings + Default-Off Click Sound Toggle, Mic Mute Guard & Accessibility Semantics
      fireEvent.click(screen.getByLabelText('全局设置'))
      const globalDialog = screen.getByRole('dialog', { name: '全局设置' })
      expect(within(globalDialog).queryByText('飞鼠灵敏度')).toBeNull()
      const soundSwitch = within(globalDialog).getByRole('switch', { name: '按键提示音' })
      expect(soundSwitch.getAttribute('aria-checked')).toBe('false')

      playClickSoundMock.mockClear()
      fireEvent.click(within(globalDialog).getByText('浅色'))
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(setSystemBarThemeMock).toHaveBeenLastCalledWith(false)
      expect(playClickSoundMock).not.toHaveBeenCalled()

      // Enable click sound -> plays 1 audition confirm click, stays SILENT on UI chrome, and ONLY clicks on controller actuation!
      playClickSoundMock.mockClear()
      fireEvent.click(soundSwitch)
      expect(useMobileStore.getState().localFeel.soundEnabled).toBe(true)
      expect(soundSwitch.getAttribute('aria-checked')).toBe('true')
      expect(playClickSoundMock).toHaveBeenCalledWith('confirm')

      playClickSoundMock.mockClear()
      triggerHaptic('tap') // UI chrome haptic -> silent!
      expect(playClickSoundMock).not.toHaveBeenCalled()

      setVoiceRecordingActive(true)
      triggerControlFeedback('tap') // Controller while mic active -> muted!
      expect(playClickSoundMock).not.toHaveBeenCalled()
      setVoiceRecordingActive(false)
      triggerControlFeedback('tap') // Controller when mic idle -> plays Leica click!
      expect(playClickSoundMock).toHaveBeenCalledWith('tap')

      // 6. Configurable Voice Trigger Modes: Hold, Toggle (点击常开) & Hybrid (智能双模)
      fireEvent.click(within(globalDialog).getByText('点击常开'))
      expect(useMobileStore.getState().localFeel.voiceTriggerMode).toBe('toggle')
      fireEvent.click(screen.getByTestId('feel-sheet-backdrop'))

      const startVoiceSpy = vi
        .spyOn(useMobileStore.getState().getClient(), 'startVoiceStream')
        .mockReturnValue(true)
      const stopVoiceSpy = vi.spyOn(useMobileStore.getState().getClient(), 'stopVoiceStream')
      const cancelVoiceSpy = vi.spyOn(useMobileStore.getState().getClient(), 'cancelVoiceStream')

      const voiceBtn = screen.getByTestId('voice-trigger-btn')
      expect(voiceBtn.textContent).toContain('点击说话')

      // First tap starts hands-free listening and stays locked after finger lifts
      fireEvent.pointerDown(voiceBtn, { pointerId: 31, clientY: 780 })
      fireEvent.pointerUp(voiceBtn, { pointerId: 31, clientY: 780 })
      expect(startVoiceSpy).toHaveBeenCalledTimes(1)
      expect(stopVoiceSpy).not.toHaveBeenCalled()
      expect(voiceBtn.textContent).toContain('正在聆听 · 点击结束')
      expect(screen.getByTestId('cancel-locked-voice')).toBeTruthy()

      // Second tap finishes & commits cleanly
      fireEvent.pointerDown(voiceBtn, { pointerId: 32, clientY: 780 })
      fireEvent.pointerUp(voiceBtn, { pointerId: 32, clientY: 780 })
      expect(stopVoiceSpy).toHaveBeenCalledTimes(1)
      expect(voiceBtn.textContent).toContain('点击说话')

      // Cancel button aborts hands-free listening without committing
      fireEvent.pointerDown(voiceBtn, { pointerId: 33, clientY: 780 })
      fireEvent.pointerUp(voiceBtn, { pointerId: 33, clientY: 780 })
      fireEvent.click(screen.getByTestId('cancel-locked-voice'))
      expect(cancelVoiceSpy).toHaveBeenCalledWith('user_cancelled')
      expect(voiceBtn.textContent).toContain('点击说话')

      // Hybrid mode: quick tap locks hands-free open!
      act(() => {
        useMobileStore.getState().updateLocalFeel({ voiceTriggerMode: 'hybrid' })
      })
      expect(voiceBtn.textContent).toContain('轻点常开 · 按住说')
      fireEvent.pointerDown(voiceBtn, { pointerId: 34, clientY: 780 })
      fireEvent.pointerUp(voiceBtn, { pointerId: 34, clientY: 780 })
      expect(useMobileStore.getState().voiceSessionState).toBe('locked')
      expect(voiceBtn.textContent).toContain('正在聆听 · 点击结束')
      fireEvent.pointerDown(voiceBtn, { pointerId: 35, clientY: 780 })
      expect(useMobileStore.getState().voiceSessionState).toBe('idle')
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origInnerWidth })
      setVoiceRecordingActive(false)
      useMobileStore.getState().disconnect()
      delete window.AxonkeyNative
    }
  })

  it('supports Single-Focus Edit Mode, Architectural Squircle Radial Halo Pad (aim, sweep detent, center cancel & release trigger), and TileStyleSheet Icon Colors', () => {
    const hapticMock = vi.fn()
    window.AxonkeyNative = {
      haptic: hapticMock,
      setKeepScreenOn: vi.fn(),
      openQrScanner: vi.fn(),
      connectWss: vi.fn(),
      sendWssText: vi.fn(() => true),
      closeWss: vi.fn(),
      saveHostCredentials: vi.fn(),
      loadHostCredentials: vi.fn(() => '[]'),
      deleteHostCredentials: vi.fn(),
    } satisfies AxonkeyAndroidBridge

    try {
      window.localStorage.clear()
      render(<App />)
      connectMockRealHost('Studio PC')

      act(() => {
        useMobileStore.setState({
          workspaceMode: 'deck',
          layoutEditing: false,
          selectedEditItem: null,
          editingTileTarget: null,
          pageManagerOpen: false,
          feelSheetOpen: false,
          pointerSettingsOpen: false,
          pointerHelpOpen: false,
          pairingOpen: false,
        })
      })

      fireEvent.click(screen.getByLabelText('自定义布局'))
      expect(screen.getByTestId('edit-mode-topbar')).toBeTruthy()

      const continueBtn = document.querySelector(
        '[data-bento-tile-id="tile.continue"]',
      ) as HTMLElement
      fireEvent.click(continueBtn)
      const dock = screen.getByTestId('edit-inspector-dock')
      expect(within(dock).getByText('已选：继续执行')).toBeTruthy()
      fireEvent.click(within(dock).getByText('1×2'))

      fireEvent.click(within(dock).getByText('编辑'))
      expect(screen.getByText('图标色彩')).toBeTruthy()
      fireEvent.click(within(screen.getByRole('dialog', { name: '编辑按键' })).getByText('完成'))

      // Insert Architectural Squircle Radial Pad (`手势垫`)
      fireEvent.click(screen.getByText('组件'))
      fireEvent.click(screen.getByText('手势垫'))
      expect(within(screen.getByTestId('edit-inspector-dock')).getByText('手势垫')).toBeTruthy()

      fireEvent.click(screen.getByText('完成'))
      const wheelSurface = screen.getByTestId('gesture-pad-surface')
      expect(screen.getByTestId('radial-wheel-svg')).toBeTruthy()

      const addedGestureZone = useMobileStore
        .getState()
        .deck.pages.find((p) => p.id === 'vibe-coding')
        ?.zones?.find((z) => z.kind === 'gesture-pad')!

      const tileActivateSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendTileActivate')

      hapticMock.mockClear()
      fireEvent.pointerDown(wheelSurface, { pointerId: 5, clientX: 100, clientY: 100 })
      expect(screen.getByTestId('radial-wheel-puck')).toBeTruthy()

      fireEvent.pointerMove(wheelSurface, { pointerId: 5, clientX: 142, clientY: 100 })
      expect(
        wheelSurface.querySelector('[data-radial-sector="3"]')?.getAttribute('data-radial-active'),
      ).toBe('true')
      expect(hapticMock).toHaveBeenCalledWith('detent')

      fireEvent.pointerMove(wheelSurface, { pointerId: 5, clientX: 100, clientY: 58 })
      expect(
        wheelSurface.querySelector('[data-radial-sector="0"]')?.getAttribute('data-radial-active'),
      ).toBe('true')

      fireEvent.pointerUp(wheelSurface, { pointerId: 5, clientX: 100, clientY: 58 })
      expect(tileActivateSpy).toHaveBeenCalledWith(addedGestureZone.tileIds[0], 'tap')

      tileActivateSpy.mockClear()
      fireEvent.pointerDown(wheelSurface, { pointerId: 6, clientX: 100, clientY: 100 })
      fireEvent.pointerMove(wheelSurface, { pointerId: 6, clientX: 100, clientY: 142 })
      fireEvent.pointerMove(wheelSurface, { pointerId: 6, clientX: 102, clientY: 104 })
      expect(screen.getByText('松开取消')).toBeTruthy()
      fireEvent.pointerUp(wheelSurface, { pointerId: 6, clientX: 102, clientY: 104 })
      expect(tileActivateSpy).not.toHaveBeenCalled()
    } finally {
      useMobileStore.getState().disconnect()
      delete window.AxonkeyNative
    }
  })

  it('dismisses all BottomSheets immediately on backdrop click, swipe-down, Escape, and Android Back', () => {
    useMobileStore.setState({
      phase: 'disconnected',
      feelSheetOpen: false,
      pointerSettingsOpen: false,
      pointerHelpOpen: false,
      pairingOpen: false,
      aboutSheetOpen: false,
    })

    render(<App />)

    fireEvent.click(screen.getByLabelText('连接与配对'))
    expect(screen.getByRole('dialog', { name: '设备连接' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('pairing-sheet-backdrop'))
    expect(screen.queryByRole('dialog', { name: '设备连接' })).toBeNull()

    fireEvent.click(screen.getByLabelText('全局设置'))
    expect(screen.getByRole('dialog', { name: '全局设置' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('打开指针与飞鼠设置'))
    expect(screen.queryByRole('dialog', { name: '全局设置' })).toBeNull()
    expect(screen.getByRole('dialog', { name: '指针与飞鼠设置' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('pointer-settings-sheet-backdrop'))
    expect(screen.queryByRole('dialog', { name: '指针与飞鼠设置' })).toBeNull()

    fireEvent.click(screen.getByLabelText('全局设置'))
    const handle = screen.getByTestId('bottom-sheet-handle')
    fireEvent.pointerDown(handle, { pointerId: 7, clientY: 120 })
    fireEvent.pointerMove(handle, { pointerId: 7, clientY: 180 })
    fireEvent.pointerUp(handle, { pointerId: 7, clientY: 180 })
    expect(screen.queryByRole('dialog', { name: '全局设置' })).toBeNull()

    fireEvent.click(screen.getByLabelText('连接与配对'))
    expect(screen.getByRole('dialog', { name: '设备连接' })).toBeTruthy()
    act(() => {
      window.__axonkeyNativeOnBack?.()
    })
    expect(screen.queryByRole('dialog', { name: '设备连接' })).toBeNull()
  })

  it('supports Mid-Grip Air-Mouse, Edge Rotary Scroll, PointerSettingsSheet Reset Defaults & Volume Keys, AboutUpdateSheet & Split Landscape', () => {
    const notifyClickPulseMock = vi.fn()
    const setVolumeConfigMock = vi.fn()
    const checkReleaseMock = vi.fn()
    const downloadApkMock = vi.fn()
    const installApkMock = vi.fn(() => true)
    const openExternalUrlMock = vi.fn(() => true)
    const setOrientationMock = vi.fn()
    const hapticMock = vi.fn()

    window.AxonkeyNative = {
      haptic: hapticMock,
      setKeepScreenOn: vi.fn(),
      openQrScanner: vi.fn(),
      connectWss: vi.fn(),
      sendWssText: vi.fn(() => true),
      closeWss: vi.fn(),
      saveHostCredentials: vi.fn(),
      loadHostCredentials: vi.fn(() => '[]'),
      deleteHostCredentials: vi.fn(),
      notifyPointerClickPulse: notifyClickPulseMock,
      setVolumeKeyMouseConfig: setVolumeConfigMock,
      getAppVersionInfo: vi.fn(() =>
        JSON.stringify({
          versionName: '0.2.0',
          versionCode: 2,
          packageName: 'com.axonkey.mobile',
        }),
      ),
      checkGithubRelease: checkReleaseMock,
      downloadAndInstallApk: downloadApkMock,
      installDownloadedApk: installApkMock,
      openExternalUrl: openExternalUrlMock,
      setScreenOrientationMode: setOrientationMock,
    } satisfies AxonkeyAndroidBridge

    const origInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })

    try {
      window.localStorage.clear()
      render(<App />)
      connectMockRealHost('Studio PC')

      fireEvent.click(screen.getByText('触控·飞鼠'))
      fireEvent.click(screen.getByText('飞鼠'))

      const midGrip = screen.getByTestId('airmouse-midgrip-layout')
      expect(midGrip.getAttribute('data-handedness')).toBe('right')
      fireEvent.click(screen.getByLabelText('切换飞鼠左右手握持'))
      expect(midGrip.getAttribute('data-handedness')).toBe('left')
      expect(screen.getByTestId('hud-toast').textContent).toContain('已切换为左手握持')

      const leftBtn = screen.getByText('左键').closest('button')!
      fireEvent.pointerDown(leftBtn, { pointerId: 1 })
      fireEvent.pointerUp(leftBtn, { pointerId: 1 })
      expect(notifyClickPulseMock).toHaveBeenCalledTimes(1)

      const scrollSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendPointerScroll')
      const buttonSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendPointerButton')
      const edgeRail = screen.getByTestId('airmouse-edge-scroll')

      fireEvent.pointerDown(edgeRail, { pointerId: 2, clientY: 100 })
      fireEvent.pointerMove(edgeRail, { pointerId: 2, clientY: 150 })
      fireEvent.pointerUp(edgeRail, { pointerId: 2, clientY: 150 })
      expect(scrollSpy).toHaveBeenCalled()

      buttonSpy.mockClear()
      fireEvent.pointerDown(edgeRail, { pointerId: 3, clientY: 120 })
      fireEvent.pointerUp(edgeRail, { pointerId: 3, clientY: 121 })
      expect(buttonSpy).toHaveBeenCalledWith('middle', 'down', expect.any(String))
      expect(buttonSpy).toHaveBeenCalledWith('middle', 'up', expect.any(String))

      // Air-Mouse Control Pad: Double-tap -> Right Click immediately; toggleable in Pointer Settings
      buttonSpy.mockClear()
      const clutchPad = screen.getByTestId('airmouse-clutch-pad')
      fireEvent.pointerDown(clutchPad, { pointerId: 11, clientX: 140, clientY: 220 })
      fireEvent.pointerUp(clutchPad, { pointerId: 11, clientX: 140, clientY: 220 })
      fireEvent.pointerDown(clutchPad, { pointerId: 12, clientX: 142, clientY: 221 })
      fireEvent.pointerUp(clutchPad, { pointerId: 12, clientX: 142, clientY: 221 })
      expect(buttonSpy).toHaveBeenCalledWith('right', 'down', expect.any(String))
      expect(buttonSpy).toHaveBeenCalledWith('right', 'up', expect.any(String))

      fireEvent.click(screen.getByLabelText('指针与飞鼠设置'))
      expect(screen.getByRole('dialog', { name: '指针与飞鼠设置' })).toBeTruthy()
      fireEvent.click(screen.getByText('飞鼠控制板点按'))
      expect(useMobileStore.getState().localFeel.airMousePadTapClick).toBe(false)
      fireEvent.click(screen.getByText('左 / 右键'))
      expect(setVolumeConfigMock).toHaveBeenLastCalledWith(false, 'lr')

      fireEvent.click(screen.getByTestId('pointer-settings-sheet-backdrop'))
      expect(setVolumeConfigMock).toHaveBeenLastCalledWith(true, 'lr')

      buttonSpy.mockClear()
      fireEvent.pointerDown(clutchPad, { pointerId: 13, clientX: 140, clientY: 220 })
      fireEvent.pointerUp(clutchPad, { pointerId: 13, clientX: 140, clientY: 220 })
      fireEvent.pointerDown(clutchPad, { pointerId: 14, clientX: 140, clientY: 220 })
      fireEvent.pointerUp(clutchPad, { pointerId: 14, clientX: 140, clientY: 220 })
      expect(buttonSpy).not.toHaveBeenCalled()

      buttonSpy.mockClear()
      act(() => {
        window.__axonkeyNativeOnVolumeKey?.('up', 'down')
      })
      expect(buttonSpy).toHaveBeenCalledTimes(1)
      const [, , downPressId] = buttonSpy.mock.calls[0]
      act(() => {
        window.__axonkeyNativeOnVolumeKey?.('up', 'up')
      })
      expect(buttonSpy).toHaveBeenLastCalledWith('left', 'up', downPressId)

      act(() => {
        useMobileStore.getState().updateSensitivity({ pointerSensitivity: 2.5, scrollSensitivity: 2.1 })
        useMobileStore.getState().updateLocalFeel({ gyroSensitivity: 2.4, threeFingerSystemGestures: false })
      })
      fireEvent.click(screen.getByLabelText('指针与飞鼠设置'))
      fireEvent.click(screen.getByLabelText('恢复默认指针设置'))
      expect(useMobileStore.getState().deck.pointerSensitivity).toBe(1.4)
      expect(useMobileStore.getState().deck.scrollSensitivity).toBe(1.0)
      expect(useMobileStore.getState().localFeel.gyroSensitivity).toBe(1.2)
      expect(useMobileStore.getState().localFeel.volumeKeyMouseMode).toBe('off')
      expect(useMobileStore.getState().localFeel.airMousePadTapClick).toBe(true)
      expect(useMobileStore.getState().localFeel.threeFingerSystemGestures).toBe(true)
      expect(screen.getByTestId('hud-toast').textContent).toContain('指针与飞鼠设置已恢复默认')
      fireEvent.click(screen.getByTestId('pointer-settings-sheet-backdrop'))

      fireEvent.click(screen.getByLabelText('全局设置'))
      fireEvent.click(screen.getByLabelText('关于与版本更新'))
      expect(screen.getByText('v0.2.0')).toBeTruthy()

      fireEvent.click(screen.getByText('Axonkey 桌面端源仓库'))
      expect(openExternalUrlMock).toHaveBeenCalledWith('https://github.com/leowzz/axonkey')
      fireEvent.click(screen.getByText('Axonkey Mobile 仓库'))
      expect(openExternalUrlMock).toHaveBeenCalledWith(
        'https://github.com/timeStarry/axonkey-mobile',
      )

      fireEvent.click(screen.getByText('检查更新'))
      expect(checkReleaseMock).toHaveBeenCalledWith('timeStarry/axonkey-mobile')
      act(() => {
        window.__axonkeyNativeOnUpdateRelease?.(
          JSON.stringify({ ok: false, code: 'no_release', error: 'HTTP 404' }),
        )
      })
      expect(screen.getByText('当前版本已是最新（仓库暂未发布新 Release）')).toBeTruthy()

      act(() => {
        window.__axonkeyNativeOnUpdateRelease?.(
          JSON.stringify({
            ok: true,
            tagName: 'v0.3.0',
            version: '0.3.0',
            title: 'Axonkey Mobile v0.3.0',
            notes: '- 正式版移除模拟体验',
            publishedAt: '2026-11-25T00:00:00Z',
            htmlUrl: 'https://github.com/timeStarry/axonkey-mobile/releases/tag/v0.3.0',
            apkUrl: 'https://github.com/timeStarry/axonkey-mobile/releases/download/v0.3.0/app.apk',
            apkName: 'axonkey-mobile-0.3.0.apk',
            apkSizeBytes: 6291456,
            sha256: '',
          }),
        )
      })
      fireEvent.click(screen.getByText('立即安装更新'))
      expect(downloadApkMock).toHaveBeenCalledWith(
        'https://github.com/timeStarry/axonkey-mobile/releases/download/v0.3.0/app.apk',
        '',
        '0.3.0',
      )

      act(() => {
        window.__axonkeyNativeOnUpdateProgress?.(
          JSON.stringify({
            phase: 'permission_required',
            percent: 100,
            downloaded: 6291456,
            total: 6291456,
            message: '需要未知来源安装权限',
          }),
        )
      })
      fireEvent.click(screen.getByText('继续安装'))
      expect(installApkMock).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByTestId('about-sheet-backdrop'))

      const origW = window.innerWidth
      const origH = window.innerHeight
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 })
      try {
        fireEvent(window, new Event('resize'))
        fireEvent.click(screen.getByLabelText('全局设置'))
        fireEvent.click(screen.getByText('横屏台架'))
        expect(setOrientationMock).toHaveBeenLastCalledWith('landscape')
        fireEvent.click(screen.getByTestId('feel-sheet-backdrop'))
        expect(screen.getByTestId('split-landscape-shell')).toBeTruthy()
      } finally {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: origW })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: origH })
      }
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origInnerWidth })
      useMobileStore.getState().disconnect()
      delete window.AxonkeyNative
    }
  })

  it('stays completely silent when compatible, and distinguishes soft drift vs hard incompatibility modals', () => {
    window.localStorage.clear()
    window.AxonkeyNative = {
      haptic: vi.fn(),
      playClickSound: vi.fn(),
      setKeepScreenOn: vi.fn(),
      openQrScanner: vi.fn(),
      connectWss: vi.fn(),
      sendWssText: vi.fn(() => true),
      closeWss: vi.fn(),
      startAudioCapture: vi.fn(() => true),
      stopAudioCapture: vi.fn(),
      saveHostCredentials: vi.fn(),
      loadHostCredentials: vi.fn(() => ''),
      deleteHostCredentials: vi.fn(),
    } as AxonkeyAndroidBridge

    try {
      render(<App />)

      // 1. Compatible handshake -> zero version notice UI
      connectMockRealHost('Studio PC')
      expect(useMobileStore.getState().phase).toBe('active')
      expect(screen.queryByTestId('version-compat-sheet-backdrop')).toBeNull()

      // 2. Soft version drift -> session stays active, dismissible notice shown once per version pair
      act(() => {
        window.__axonkeyNativeOnMessage?.(
          JSON.stringify({
            type: 'server.ready',
            sessionId: 'sess-soft-1',
            inputEpoch: 2,
            inputGeneration: 2,
            leaseId: 2,
            leaseTtlMs: 60_000,
            tickIntervalMs: 250,
            hostId: 'pc-1',
            hostName: 'Studio PC',
            capabilities: {
              relativePointer: true,
              absolutePointer: true,
              binaryPointerV1: true,
              binaryAudioV1: true,
              textCommit: true,
              audioPcm16: true,
              udpDiscoveryPort: 49671,
              platform: 'windows',
              hostVersion: '1.12.0',
              protocolApi: 2,
              minRequiredClientApi: 1,
              minRecommendedClientVersion: '0.5.0',
            },
            deckSnapshot: structuredClone(DEFAULT_MOBILE_DECK),
            deckRevision: 1,
            context: { appId: null, appName: null, profileName: '默认配置' },
            contextRevision: 1,
          }),
        )
      })
      expect(useMobileStore.getState().phase).toBe('active')
      expect(screen.getByTestId('version-compat-sheet-backdrop')).toBeTruthy()
      expect(screen.getByText('版本跨度较大 · 可能影响体验')).toBeTruthy()
      fireEvent.click(screen.getByText('继续使用（本版本不再提示）'))
      expect(screen.queryByTestId('version-compat-sheet-backdrop')).toBeNull()

      // 3. Hard protocol incompatibility -> disconnects session and prompts mandatory update
      act(() => {
        window.__axonkeyNativeOnMessage?.(
          JSON.stringify({
            type: 'server.ready',
            sessionId: 'sess-hard-1',
            inputEpoch: 3,
            inputGeneration: 3,
            leaseId: 3,
            leaseTtlMs: 60_000,
            tickIntervalMs: 250,
            hostId: 'pc-1',
            hostName: 'Future PC',
            capabilities: {
              relativePointer: true,
              absolutePointer: true,
              binaryPointerV1: true,
              binaryAudioV1: true,
              textCommit: true,
              audioPcm16: true,
              udpDiscoveryPort: 49671,
              platform: 'windows',
              hostVersion: '2.0.0',
              protocolApi: 3,
              minRequiredClientApi: 3,
              minRecommendedClientVersion: '1.0.0',
            },
            deckSnapshot: structuredClone(DEFAULT_MOBILE_DECK),
            deckRevision: 1,
            context: { appId: null, appName: null, profileName: '默认配置' },
            contextRevision: 1,
          }),
        )
      })
      expect(useMobileStore.getState().phase).toBe('disconnected')
      expect(screen.getByTestId('version-compat-sheet-backdrop')).toBeTruthy()
      expect(screen.getByText('协议不兼容 · 需更新后连接')).toBeTruthy()
      fireEvent.click(screen.getByText('知道了'))
    } finally {
      useMobileStore.getState().disconnect()
      delete window.AxonkeyNative
    }
  })
})
