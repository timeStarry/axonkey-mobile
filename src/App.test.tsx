import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { App } from './App'
import { useMobileStore } from './state/useMobileStore'
import { DEFAULT_DEMO_DECK } from './transport/defaultDeck'
import type { AxonkeyAndroidBridge } from './transport/nativeBridge'

describe('Axonkey Mobile UI', () => {
  it('renders thumb-zone navigation, dynamic voice binding, 2-tab Touchpad/Air-Mouse with shared Recenter, and Light/Dark/System themes', () => {
    const recenterCursorMock = vi.fn(() => true)
    const setSystemBarThemeMock = vi.fn()
    window.AxonkeyNative = {
      haptic: vi.fn(),
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

    try {
      useMobileStore.setState({
        phase: 'active',
        isDemoMode: false,
        hostId: 'pc-1',
        hostName: 'Studio PC',
        context: { appId: 'doubao.exe', appName: '豆包', profileName: '通用语音' },
        deck: {
          ...structuredClone(DEFAULT_DEMO_DECK),
          voiceBindingSummary: 'Alt',
        },
        workspaceMode: 'remote',
        pointerTab: 'trackpad',
        airMouseFeel: 'relative',
      })

      render(<App />)

      // Header shows active host & foreground app badge
      expect(screen.getByText('Studio PC')).toBeTruthy()
      expect(screen.getByText('豆包')).toBeTruthy()

      // VoiceTextDock dynamically reflects PC voiceBindingSummary ('Alt')
      expect(screen.getByText('按住说话 · Alt + 虚拟麦')).toBeTruthy()

      // When voiceBindingSummary is null -> pure virtual mic label
      act(() => {
        useMobileStore.setState((s) => ({
          deck: { ...s.deck, voiceBindingSummary: null },
        }))
      })
      expect(screen.getByText('按住说话 · 虚拟麦克风')).toBeTruthy()

      // Switch to 触控·飞鼠 workspace via thumb-zone segmented bar -> only 2 primary pointer tabs!
      fireEvent.click(screen.getByText('触控·飞鼠'))
      expect(screen.getByText('触控板')).toBeTruthy()
      expect(screen.getByText('体感飞鼠')).toBeTruthy()
      expect(screen.queryByText('归中瞄准')).toBeNull()

      // In 触控板, 1-tap 屏幕归中 snaps cursor to center
      fireEvent.click(screen.getByLabelText('屏幕归中'))
      expect(recenterCursorMock).toHaveBeenCalledTimes(1)
      expect(screen.getByText('已归中')).toBeTruthy()

      // Switch to 体感飞鼠 -> defaults to 惯性飞鼠 + 屏幕归中 utility button
      fireEvent.click(screen.getByText('体感飞鼠'))
      expect(screen.getByText('按住飞鼠移动（离合键）')).toBeTruthy()
      fireEvent.click(screen.getByLabelText('屏幕归中'))
      expect(recenterCursorMock).toHaveBeenCalledTimes(2)

      // Toggle tracking feel inside 体感飞鼠 -> 激光指哪
      fireEvent.click(screen.getByText('激光指哪'))
      expect(screen.getByText('对准屏幕正中央 · 点击校准归中')).toBeTruthy()

      // Open LocalFeelSheet via header gear icon and test Light / Dark / System theme switcher
      fireEvent.click(screen.getByLabelText('本地手感设置'))
      expect(screen.getByText('本地外观与操控手感')).toBeTruthy()

      fireEvent.click(screen.getByText('浅色模式'))
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(setSystemBarThemeMock).toHaveBeenLastCalledWith(false)

      fireEvent.click(screen.getByText('深色模式'))
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(setSystemBarThemeMock).toHaveBeenLastCalledWith(true)

      fireEvent.click(screen.getByText('跟随系统'))
      expect(useMobileStore.getState().localFeel.themeMode).toBe('system')
    } finally {
      delete window.AxonkeyNative
    }
  })

  it('supports v3 in-place Bento layout editing, 1-tap span cycling, TileStyleSheet, drag reorder, and mixed pointer+shortcut templates', () => {
    useMobileStore.setState({
      phase: 'active',
      isDemoMode: true,
      hostId: 'demo-desktop',
      hostName: 'Demo Desktop',
      deck: structuredClone(DEFAULT_DEMO_DECK),
      workspaceMode: 'deck',
      layoutEditing: false,
      editingTileTarget: null,
      pageManagerOpen: false,
      feelSheetOpen: false,
      pairingOpen: false,
    })

    render(<App />)

    // Enter Layout Edit Mode from top header
    fireEvent.click(screen.getByLabelText('自定义布局'))
    expect(screen.getByText('加按键')).toBeTruthy()
    expect(screen.getByText('加区块')).toBeTruthy()

    // Vibe Coding page has tile.continue (2x1) -> 1-tap corner pill cycles 2x1 -> 1x2
    const spanBadge = screen.getByLabelText('切换尺寸 继续执行 (2×1)')
    fireEvent.click(spanBadge)
    const updatedVibe = useMobileStore
      .getState()
      .deck.pages.find((p) => p.id === 'vibe-coding')!
    const continueTile = updatedVibe.tiles.find((t) => t.id === 'tile.continue')!
    expect(continueTile.colSpan).toBe(1)
    expect(continueTile.rowSpan).toBe(2)

    // Tap tile to open TileStyleSheet -> check PC binding readout & edit label/mode
    const enterBtn = document.querySelector('[data-bento-tile-id="tile.enter"]') as HTMLElement
    expect(enterBtn).toBeTruthy()
    fireEvent.click(enterBtn)
    expect(screen.getByText('按键样式与模式')).toBeTruthy()
    expect(screen.getByText(/电脑端当前绑定：/)).toBeTruthy()

    fireEvent.click(screen.getByText('持续按住 Hold'))
    expect(
      useMobileStore
        .getState()
        .deck.pages.find((p) => p.id === 'vibe-coding')
        ?.tiles.find((t) => t.id === 'tile.enter')?.mode,
    ).toBe('hold')
    fireEvent.click(screen.getByText('完成设置'))

    // Drag-and-drop reorder via pointerdown + >8px pointermove + elementFromPoint + pointerup
    const acceptBtn = document.querySelector('[data-bento-tile-id="tile.accept"]') as HTMLElement
    const origElementFromPoint = document.elementFromPoint
    document.elementFromPoint = () => acceptBtn
    try {
      fireEvent.pointerDown(enterBtn, { pointerId: 1, clientX: 20, clientY: 20 })
      fireEvent.pointerMove(enterBtn, { pointerId: 1, clientX: 60, clientY: 60 })
      fireEvent.pointerUp(enterBtn, { pointerId: 1, clientX: 60, clientY: 60 })
    } finally {
      document.elementFromPoint = origElementFromPoint
    }

    const reorderedZone = useMobileStore
      .getState()
      .deck.pages.find((p) => p.id === 'vibe-coding')?.zones?.[0]
    expect(reorderedZone?.tileIds.slice(0, 3)).toEqual([
      'tile.continue',
      'tile.accept',
      'tile.enter',
    ])

    // Create a Mixed Pointer + Bento page from PageManagerSheet template
    fireEvent.click(screen.getByText('新建页'))
    expect(screen.getByText('页面管理与新建模板')).toBeTruthy()
    fireEvent.click(screen.getByText('触控+快捷混排'))

    // Exit edit mode and verify embedded trackpad +归中 + shortcut tiles render together on one page
    fireEvent.click(screen.getByText('完成'))
    expect(screen.getByText('单指移动 · 轻点左键 · 双指滚轮')).toBeTruthy()
    expect(screen.getByLabelText('归中')).toBeTruthy()
    expect(screen.getByText('主动作')).toBeTruthy()
  })

  it('supports v4 Mid-Grip Air-Mouse, Edge Infinite Scroll Strip, Click Stabilizer, and Hardware Volume Key takeover', async () => {
    const notifyClickPulseMock = vi.fn()
    const setVolumeConfigMock = vi.fn()
    const hapticMock = vi.fn()
    const sentFrames: string[] = []

    window.AxonkeyNative = {
      haptic: hapticMock,
      setKeepScreenOn: vi.fn(),
      openQrScanner: vi.fn(),
      connectWss: vi.fn(),
      sendWssText: vi.fn((raw: string) => {
        sentFrames.push(raw)
        return true
      }),
      closeWss: vi.fn(),
      saveHostCredentials: vi.fn(),
      loadHostCredentials: vi.fn(() => '[]'),
      deleteHostCredentials: vi.fn(),
      notifyPointerClickPulse: notifyClickPulseMock,
      setVolumeKeyMouseConfig: setVolumeConfigMock,
    } satisfies AxonkeyAndroidBridge

    try {
      window.localStorage.clear()
      render(<App />)

      // Connect Demo session cleanly via store and wait 35ms for DemoLoopbackTransport server.ready!
      await act(async () => {
        useMobileStore.getState().connectDemo()
        await new Promise((r) => setTimeout(r, 35))
      })

      // Switch to 触控·飞鼠 -> 体感飞鼠
      fireEvent.click(screen.getByText('触控·飞鼠'))
      fireEvent.click(screen.getByText('体感飞鼠'))

      const midGrip = screen.getByTestId('airmouse-midgrip-layout')
      expect(midGrip.getAttribute('data-handedness')).toBe('right')

      // Toggle Right -> Left handedness
      fireEvent.click(screen.getByLabelText('切换飞鼠左右手握持'))
      expect(midGrip.getAttribute('data-handedness')).toBe('left')
      expect(screen.getByText('左手')).toBeTruthy()

      // Pressing Mid-Grip 左键 triggers 75ms Click-Stabilizer pulse BEFORE down
      const leftBtn = screen.getByText('左键').closest('button')!
      fireEvent.pointerDown(leftBtn, { pointerId: 1 })
      fireEvent.pointerUp(leftBtn, { pointerId: 1 })
      expect(notifyClickPulseMock).toHaveBeenCalledTimes(1)

      // Edge Scroll Rail: smooth vertical drag -> sendPointerScroll + notch haptics every ~22px
      const scrollSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendPointerScroll')
      const buttonSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendPointerButton')
      const edgeRail = screen.getByTestId('airmouse-edge-scroll')

      hapticMock.mockClear()
      fireEvent.pointerDown(edgeRail, { pointerId: 2, clientY: 100 })
      fireEvent.pointerMove(edgeRail, { pointerId: 2, clientY: 150 }) // 50px -> 2 notches (44px)
      fireEvent.pointerUp(edgeRail, { pointerId: 2, clientY: 150 })
      expect(scrollSpy).toHaveBeenCalled()
      expect(hapticMock).toHaveBeenCalledWith('tap')

      // Quick tap on Edge Scroll Rail -> Middle Click!
      buttonSpy.mockClear()
      fireEvent.pointerDown(edgeRail, { pointerId: 3, clientY: 120 })
      fireEvent.pointerUp(edgeRail, { pointerId: 3, clientY: 121 })
      expect(buttonSpy).toHaveBeenCalledWith('middle', 'down', expect.any(String))
      expect(buttonSpy).toHaveBeenCalledWith('middle', 'up', expect.any(String))

      // Enable Hardware Volume Key mode 'lr' in LocalFeelSheet
      fireEvent.click(screen.getByLabelText('本地手感设置'))
      // While sheet is open, capture MUST remain false!
      fireEvent.click(screen.getByText('音量+左/音量-右'))
      expect(setVolumeConfigMock).toHaveBeenLastCalledWith(false, 'lr')

      // Close sheet -> now in active Air-Mouse with no sheet open -> capture turns TRUE!
      fireEvent.click(screen.getByLabelText('关闭'))
      expect(setVolumeConfigMock).toHaveBeenLastCalledWith(true, 'lr')
      expect(screen.getByText('音量键左/右')).toBeTruthy()

      // Simulate native Vol+ hold & release -> dispatches real left down & up with matching pressId
      buttonSpy.mockClear()
      act(() => {
        window.__axonkeyNativeOnVolumeKey?.('up', 'down')
      })
      expect(buttonSpy).toHaveBeenCalledTimes(1)
      const [downBtn, downPhase, downPressId] = buttonSpy.mock.calls[0]
      expect(downBtn).toBe('left')
      expect(downPhase).toBe('down')

      act(() => {
        window.__axonkeyNativeOnVolumeKey?.('up', 'up')
      })
      expect(buttonSpy).toHaveBeenLastCalledWith('left', 'up', downPressId)

      // Leaving Air-Mouse to 遥控器 immediately disables volume key capture!
      fireEvent.click(screen.getByText('遥控器'))
      expect(setVolumeConfigMock).toHaveBeenLastCalledWith(false, 'lr')
    } finally {
      delete window.AxonkeyNative
    }
  })

  it('supports v4 AboutUpdateSheet (no_release & update progress), PresetWizardSheet, Gesture Pad, and Split Landscape UI', async () => {
    const checkReleaseMock = vi.fn()
    const downloadApkMock = vi.fn()
    const installApkMock = vi.fn(() => true)
    const openExternalUrlMock = vi.fn(() => true)
    const setOrientationMock = vi.fn()

    window.AxonkeyNative = {
      haptic: vi.fn(),
      setKeepScreenOn: vi.fn(),
      openQrScanner: vi.fn(),
      connectWss: vi.fn(),
      sendWssText: vi.fn(() => true),
      closeWss: vi.fn(),
      saveHostCredentials: vi.fn(),
      loadHostCredentials: vi.fn(() => '[]'),
      deleteHostCredentials: vi.fn(),
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

    try {
      window.localStorage.clear()
      render(<App />)

      await act(async () => {
        useMobileStore.getState().connectDemo()
        await new Promise((r) => setTimeout(r, 35))
      })

      // 1. Open LocalFeelSheet -> open AboutUpdateSheet
      fireEvent.click(screen.getByLabelText('本地手感设置'))
      fireEvent.click(screen.getByLabelText('关于与版本更新'))
      expect(screen.getByText('关于与版本更新')).toBeTruthy()
      expect(screen.getByText('v0.2.0')).toBeTruthy()

      // Test Dual GitHub Repository Jump Cards
      fireEvent.click(screen.getByText('Axonkey 桌面端源仓库'))
      expect(openExternalUrlMock).toHaveBeenCalledWith('https://github.com/leowzz/axonkey')
      fireEvent.click(screen.getByText('Axonkey Mobile 仓库'))
      expect(openExternalUrlMock).toHaveBeenCalledWith(
        'https://github.com/timeStarry/axonkey-mobile',
      )

      // Check Update -> graceful no_release (HTTP 404 before first release)
      fireEvent.click(screen.getByText('检查更新'))
      expect(checkReleaseMock).toHaveBeenCalledWith('timeStarry/axonkey-mobile')
      act(() => {
        window.__axonkeyNativeOnUpdateRelease?.(
          JSON.stringify({ ok: false, code: 'no_release', error: 'HTTP 404' }),
        )
      })
      expect(
        screen.getByText('当前版本已是最新（仓库暂未发布新 Release）'),
      ).toBeTruthy()

      // Check Update -> newer semver v0.3.0 + progress + permission_required -> 继续安装
      act(() => {
        window.__axonkeyNativeOnUpdateRelease?.(
          JSON.stringify({
            ok: true,
            tagName: 'v0.3.0',
            version: '0.3.0',
            title: 'Axonkey Mobile v0.3.0',
            notes: '- 新增体感防抖与手势垫',
            publishedAt: '2026-11-24T00:00:00Z',
            htmlUrl: 'https://github.com/timeStarry/axonkey-mobile/releases/tag/v0.3.0',
            apkUrl: 'https://github.com/timeStarry/axonkey-mobile/releases/download/v0.3.0/app.apk',
            apkName: 'axonkey-mobile-0.3.0.apk',
            apkSizeBytes: 6291456,
            sha256: '',
          }),
        )
      })
      expect(screen.getByText(/发现新版本：Axonkey Mobile v0.3.0/)).toBeTruthy()
      fireEvent.click(screen.getByText('立即安装更新'))
      expect(downloadApkMock).toHaveBeenCalledWith(
        'https://github.com/timeStarry/axonkey-mobile/releases/download/v0.3.0/app.apk',
        '',
        '0.3.0',
      )

      act(() => {
        window.__axonkeyNativeOnUpdateProgress?.(
          JSON.stringify({
            phase: 'downloading',
            percent: 50,
            downloaded: 3145728,
            total: 6291456,
          }),
        )
      })
      expect(screen.getByText(/正在下载更新 50%/)).toBeTruthy()

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
      fireEvent.click(screen.getByLabelText('关闭关于面板'))

      // 2. Starter Preset Wizard: switch to '从空白开始 · 纯净自定义' in Demo Mode
      fireEvent.click(screen.getByLabelText('本地手感设置'))
      fireEvent.click(screen.getByText('预设方案与开箱向导'))
      expect(screen.getByText('一键同步手机端面板布局与电脑端按键绑定')).toBeTruthy()
      fireEvent.click(screen.getByText('从空白开始 · 纯净自定义'))
      fireEvent.click(screen.getByText('应用此预设方案'))

      expect(useMobileStore.getState().deck.activePageId).toBe('custom-canvas')
      expect(useMobileStore.getState().deck.voiceBindingSummary).toBeNull()
      expect(screen.getByText('自定义 1')).toBeTruthy()

      // 3. Add a Gesture Pad in Layout Editor & trigger Up swipe (>32px)
      fireEvent.click(screen.getByLabelText('自定义布局'))
      fireEvent.click(screen.getByText('加区块'))
      fireEvent.click(screen.getByText('手势触发垫'))
      fireEvent.click(screen.getByText('完成'))

      const tileActivateSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendTileActivate')
      const gesturePad = screen.getByTestId('gesture-pad-surface')
      fireEvent.pointerDown(gesturePad, { pointerId: 5, clientX: 150, clientY: 180 })
      fireEvent.pointerMove(gesturePad, { pointerId: 5, clientX: 150, clientY: 130 }) // dy = -50 -> Up slot[0]
      fireEvent.pointerUp(gesturePad, { pointerId: 5, clientX: 150, clientY: 130 })

      const createdGestureZone = useMobileStore
        .getState()
        .deck.pages.find((p) => p.id === 'custom-canvas')
        ?.zones?.find((z) => z.kind === 'gesture-pad')
      expect(createdGestureZone).toBeTruthy()
      expect(tileActivateSpy).toHaveBeenCalledWith(createdGestureZone!.tileIds[0], 'tap')

      // 4. Split Landscape Ergonomic Layout when selecting '横屏台架'
      fireEvent.click(screen.getByLabelText('本地手感设置'))
      fireEvent.click(screen.getByText('横屏台架'))
      expect(setOrientationMock).toHaveBeenLastCalledWith('landscape')
      fireEvent.click(screen.getByLabelText('关闭'))
      expect(screen.getByTestId('split-landscape-shell')).toBeTruthy()
    } finally {
      delete window.AxonkeyNative
    }
  })
})
