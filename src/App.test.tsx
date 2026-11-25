import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { App } from './App'
import { useMobileStore } from './state/useMobileStore'
import { DEFAULT_DEMO_DECK } from './transport/defaultDeck'
import {
  setVoiceRecordingActive,
  triggerHaptic,
  type AxonkeyAndroidBridge,
} from './transport/nativeBridge'

describe('Axonkey Mobile v6 — Harmonious Siri Remote, 1/4 Annular Sector Press, Radial Wheel, Split Settings & Tactile Sound', () => {
  it('renders 3-band Siri Remote proportions, true 1/4 annular sector press animation, multi-span silkscreens, split Global vs Pointer Settings, and tactile click sounds', async () => {
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
      render(<App />)

      await act(async () => {
        useMobileStore.getState().connectDemo()
        await new Promise((r) => setTimeout(r, 35))
      })

      act(() => {
        useMobileStore.setState({
          isDemoMode: false,
          hostId: 'pc-1',
          hostName: 'Studio PC',
          context: { appId: 'doubao.exe', appName: '豆包', profileName: '通用语音' },
          workspaceMode: 'remote',
          pointerTab: 'trackpad',
          airMouseFeel: 'relative',
        })
      })

      // 1. Minimal Header + Harmonious 3-band Siri Remote (no cramped 4th quick block on remote page!)
      expect(screen.getByText('Studio PC')).toBeTruthy()
      expect(screen.getByText('豆包')).toBeTruthy()
      expect(screen.queryByText('继续执行')).toBeNull()
      expect(screen.getByText('按住说话')).toBeTruthy()

      // 2. True 1/4 Annular Sector Press Animation on Circular Clickpad (`触控圆盘`)
      const tileActivateSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendTileActivate')
      const clickpadRing = screen.getByTestId('circular-clickpad-ring')
      const sectorSvg = screen.getByTestId('clickpad-sector-svg')
      const upSectorPath = sectorSvg.querySelector('[data-sector-slot="1"]') as SVGPathElement
      expect(upSectorPath).toBeTruthy()
      expect(upSectorPath.getAttribute('data-sector-active')).toBe('false')

      const upBtn = within(clickpadRing).getByLabelText('上')
      playClickSoundMock.mockClear()
      fireEvent.pointerDown(upBtn, { pointerId: 1, clientX: 110, clientY: 20 })
      // Pressing '上' actively depresses the exact 1/4 top annular sector & tilts the 3D ring!
      expect(upSectorPath.getAttribute('data-sector-active')).toBe('true')
      expect(clickpadRing.style.transform).toContain('rotateX')
      fireEvent.pointerUp(upBtn, { pointerId: 1, clientX: 110, clientY: 20 })
      expect(upSectorPath.getAttribute('data-sector-active')).toBe('false')
      expect(tileActivateSpy).toHaveBeenCalledWith('remote.up', 'tap')
      expect(playClickSoundMock).toHaveBeenCalledWith('tap')

      tileActivateSpy.mockClear()
      hapticMock.mockClear()
      // Swipe right across outer ring: 30px (>26px) triggers 1st right step, +38px triggers 2nd right step with detent!
      fireEvent.pointerDown(clickpadRing, { pointerId: 2, clientX: 80, clientY: 40 })
      fireEvent.pointerMove(clickpadRing, { pointerId: 2, clientX: 110, clientY: 42 })
      fireEvent.pointerMove(clickpadRing, { pointerId: 2, clientX: 148, clientY: 43 })
      fireEvent.pointerUp(clickpadRing, { pointerId: 2, clientX: 148, clientY: 43 })
      expect(tileActivateSpy).toHaveBeenCalledTimes(2)
      expect(tileActivateSpy).toHaveBeenNthCalledWith(1, 'remote.right', 'tap')
      expect(tileActivateSpy).toHaveBeenNthCalledWith(2, 'remote.right', 'tap')
      expect(hapticMock).toHaveBeenCalledWith('detent')

      // 3. Physical-Geometry Silkscreen:
      // In 3-col portrait (~362px wide), 2x1 (~238px) shows silkscreen while 1x1 (~114px) hides it;
      // switching to a 2-col grid makes 1x1 tiles ~176px wide, so 1x1 tiles automatically show silkscreen!
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
      // Now in 2-col grid, 1x1 tiles are ~176px wide (>= 144px) -> Ctrl+Enter, Ctrl+Z, Ctrl+C silkscreens appear!
      expect(screen.getByText('Ctrl+Enter')).toBeTruthy()
      expect(screen.getByText('Ctrl+Z')).toBeTruthy()

      // 4. Touchpad & Air-Mouse: HUD Tips, Gesture Help Info Sheet, Pointer Settings Sheet & NO misleading Volume badge
      fireEvent.click(screen.getByText('触控·飞鼠'))
      expect(screen.getByTestId('standalone-trackpad-surface')).toBeTruthy()

      fireEvent.click(screen.getByLabelText('拖拽锁定'))
      expect(screen.getByTestId('hud-toast').textContent).toContain('左键拖拽已锁定')

      fireEvent.click(screen.getByLabelText('屏幕归中'))
      expect(recenterCursorMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('hud-toast').textContent).toContain('光标已归中')

      // Open Gesture Help Info Sheet (`操控手势说明`)
      fireEvent.click(screen.getByLabelText('操控手势说明'))
      expect(screen.getByRole('dialog', { name: '操控手势说明' })).toBeTruthy()
      expect(screen.getByText('三指上滑 / 下滑')).toBeTruthy()
      fireEvent.click(screen.getByTestId('pointer-help-sheet-backdrop'))
      expect(screen.queryByRole('dialog', { name: '操控手势说明' })).toBeNull()

      // Switch to Air-Mouse -> verify NO non-clickable volume icon even when volumeKeyMouseMode !== 'off'
      act(() => {
        useMobileStore.getState().updateLocalFeel({ volumeKeyMouseMode: 'lr' })
      })
      fireEvent.click(screen.getByText('飞鼠'))
      expect(screen.queryByLabelText('音量键鼠标已开启')).toBeNull()

      // 5. Global Settings (`全局设置`) vs Pointer Settings (`指针与飞鼠设置`) + Optional Click Sound Toggle & Mic Mute Guard
      fireEvent.click(screen.getByLabelText('全局设置'))
      const globalDialog = screen.getByRole('dialog', { name: '全局设置' })
      expect(globalDialog).toBeTruthy()
      // Pointer sliders must NOT pollute Global Settings!
      expect(within(globalDialog).queryByText('飞鼠灵敏度')).toBeNull()
      expect(within(globalDialog).getByText('按键提示音')).toBeTruthy()

      // Toggle off 按键提示音 -> playClickSound stops firing while haptic still works
      fireEvent.click(within(globalDialog).getByText('按键提示音'))
      expect(useMobileStore.getState().localFeel.soundEnabled).toBe(false)
      playClickSoundMock.mockClear()
      fireEvent.click(within(globalDialog).getByText('浅色'))
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(setSystemBarThemeMock).toHaveBeenLastCalledWith(false)
      expect(playClickSoundMock).not.toHaveBeenCalled()

      // Turn 按键提示音 back on, then verify voice recording mute guard suppresses speaker clicks
      fireEvent.click(within(globalDialog).getByText('按键提示音'))
      expect(useMobileStore.getState().localFeel.soundEnabled).toBe(true)
      playClickSoundMock.mockClear()
      setVoiceRecordingActive(true)
      triggerHaptic('tap')
      expect(playClickSoundMock).not.toHaveBeenCalled()
      setVoiceRecordingActive(false)
      triggerHaptic('tap')
      expect(playClickSoundMock).toHaveBeenCalledWith('tap')

      fireEvent.click(within(globalDialog).getByText('深色'))
      fireEvent.click(within(globalDialog).getByText('跟随系统'))
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origInnerWidth })
      setVoiceRecordingActive(false)
      delete window.AxonkeyNative
    }
  })

  it('supports Single-Focus Edit Mode, Interactive 60fps Radial Marking Wheel (aim, sweep detent, center cancel & release trigger), and TileStyleSheet Icon Colors', () => {
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
      useMobileStore.setState({
        phase: 'active',
        isDemoMode: true,
        hostId: 'demo-desktop',
        hostName: 'Demo Desktop',
        deck: structuredClone(DEFAULT_DEMO_DECK),
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

      render(<App />)

      // Enter Single-Focus Edit Mode
      fireEvent.click(screen.getByLabelText('自定义布局'))
      expect(screen.getByTestId('edit-mode-topbar')).toBeTruthy()

      // Tap tile.continue -> bottom contextual inspector -> change to 1x2 -> open TileStyleSheet
      const continueBtn = document.querySelector(
        '[data-bento-tile-id="tile.continue"]',
      ) as HTMLElement
      fireEvent.click(continueBtn)
      const dock = screen.getByTestId('edit-inspector-dock')
      expect(within(dock).getByText('已选：继续执行')).toBeTruthy()
      fireEvent.click(within(dock).getByText('1×2'))

      fireEvent.click(within(dock).getByText('编辑'))
      expect(screen.getByText('编辑按键')).toBeTruthy()
      expect(screen.getByText('图标色彩')).toBeTruthy()
      fireEvent.click(within(screen.getByRole('dialog', { name: '编辑按键' })).getByText('完成'))

      // Insert Radial Marking Wheel (`手势垫`) via [+ 组件 -> 手势垫]
      fireEvent.click(screen.getByText('组件'))
      fireEvent.click(screen.getByText('手势垫'))
      expect(within(screen.getByTestId('edit-inspector-dock')).getByText('手势垫')).toBeTruthy()

      // Exit edit mode -> test 60fps Radial Marking Wheel (`gesture-pad-surface`)
      fireEvent.click(screen.getByText('完成'))
      const wheelSurface = screen.getByTestId('gesture-pad-surface')
      const wheelSvg = screen.getByTestId('radial-wheel-svg')
      expect(wheelSvg).toBeTruthy()

      const addedGestureZone = useMobileStore
        .getState()
        .deck.pages.find((p) => p.id === 'vibe-coding')
        ?.zones?.find((z) => z.kind === 'gesture-pad')!
      expect(addedGestureZone).toBeTruthy()

      const tileActivateSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendTileActivate')

      // 1) Hold + drag right (>= 26px) -> shows live puck & illuminates right sector (slot 3), sweep up -> detent tick, release -> fires up sector (slot 0)!
      hapticMock.mockClear()
      fireEvent.pointerDown(wheelSurface, { pointerId: 5, clientX: 100, clientY: 100 })
      expect(screen.getByTestId('radial-wheel-puck')).toBeTruthy()

      fireEvent.pointerMove(wheelSurface, { pointerId: 5, clientX: 142, clientY: 100 }) // Right (slot 3)
      expect(
        wheelSurface.querySelector('[data-radial-sector="3"]')?.getAttribute('data-radial-active'),
      ).toBe('true')
      expect(hapticMock).toHaveBeenCalledWith('detent')

      fireEvent.pointerMove(wheelSurface, { pointerId: 5, clientX: 100, clientY: 58 }) // Sweep Up (slot 0)
      expect(
        wheelSurface.querySelector('[data-radial-sector="0"]')?.getAttribute('data-radial-active'),
      ).toBe('true')

      fireEvent.pointerUp(wheelSurface, { pointerId: 5, clientX: 100, clientY: 58 })
      expect(tileActivateSpy).toHaveBeenCalledWith(addedGestureZone.tileIds[0], 'tap')

      // 2) Drag out to aim, then return inside < 15px center deadzone -> shows '松开取消' and cancels cleanly!
      tileActivateSpy.mockClear()
      fireEvent.pointerDown(wheelSurface, { pointerId: 6, clientX: 100, clientY: 100 })
      fireEvent.pointerMove(wheelSurface, { pointerId: 6, clientX: 100, clientY: 142 }) // Down (slot 1)
      fireEvent.pointerMove(wheelSurface, { pointerId: 6, clientX: 102, clientY: 104 }) // Return to center (< 15px)
      expect(screen.getByText('松开取消')).toBeTruthy()
      fireEvent.pointerUp(wheelSurface, { pointerId: 6, clientX: 102, clientY: 104 })
      expect(tileActivateSpy).not.toHaveBeenCalled()
    } finally {
      delete window.AxonkeyNative
    }
  })

  it('dismisses all BottomSheets immediately on backdrop click, swipe-down, Escape, and Android Back', () => {
    useMobileStore.setState({
      phase: 'active',
      isDemoMode: true,
      feelSheetOpen: false,
      pointerSettingsOpen: false,
      pointerHelpOpen: false,
      pairingOpen: false,
      aboutSheetOpen: false,
    })

    render(<App />)

    // 1. PairingSheet closes on backdrop click
    fireEvent.click(screen.getByLabelText('连接与配对'))
    expect(screen.getByRole('dialog', { name: '设备连接' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('pairing-sheet-backdrop'))
    expect(screen.queryByRole('dialog', { name: '设备连接' })).toBeNull()

    // 2. Global Settings (`全局设置`) -> sub-navigation to Pointer Settings (`指针与飞鼠设置`) -> backdrop close
    fireEvent.click(screen.getByLabelText('全局设置'))
    expect(screen.getByRole('dialog', { name: '全局设置' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('打开指针与飞鼠设置'))
    expect(screen.queryByRole('dialog', { name: '全局设置' })).toBeNull()
    expect(screen.getByRole('dialog', { name: '指针与飞鼠设置' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('pointer-settings-sheet-backdrop'))
    expect(screen.queryByRole('dialog', { name: '指针与飞鼠设置' })).toBeNull()

    // 3. Swipe-down (>48px) on grabber handle & Android native Back hook close sheet
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

  it('supports Mid-Grip Air-Mouse, Edge Rotary Scroll, PointerSettingsSheet Volume Keys, HUD Tips, AboutUpdateSheet & Split Landscape', async () => {
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

      await act(async () => {
        useMobileStore.getState().connectDemo()
        await new Promise((r) => setTimeout(r, 35))
      })

      // Air-Mouse Mid-Grip + Handedness HUD Tip + Click Stabilizer + Edge Encoder
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

      // Configure Hardware Volume Keys directly from toolbar's `指针与飞鼠设置` button!
      fireEvent.click(screen.getByLabelText('指针与飞鼠设置'))
      expect(screen.getByRole('dialog', { name: '指针与飞鼠设置' })).toBeTruthy()
      fireEvent.click(screen.getByText('左 / 右键'))
      expect(setVolumeConfigMock).toHaveBeenLastCalledWith(false, 'lr')

      fireEvent.click(screen.getByTestId('pointer-settings-sheet-backdrop'))
      expect(setVolumeConfigMock).toHaveBeenLastCalledWith(true, 'lr')

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

      // One-tap Reset to Defaults (`恢复默认`) in PointerSettingsSheet
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
      expect(useMobileStore.getState().localFeel.threeFingerSystemGestures).toBe(true)
      expect(screen.getByTestId('hud-toast').textContent).toContain('指针与飞鼠设置已恢复默认')
      fireEvent.click(screen.getByTestId('pointer-settings-sheet-backdrop'))

      // AboutUpdateSheet check + download + permission_required flow from Global Settings
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
            notes: '- 圆盘 1/4 扇区与径向轮盘重构',
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

      // Split Landscape mode
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
      delete window.AxonkeyNative
    }
  })
})
