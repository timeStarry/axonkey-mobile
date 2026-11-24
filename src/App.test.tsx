import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { App } from './App'
import { useMobileStore } from './state/useMobileStore'
import { DEFAULT_DEMO_DECK } from './transport/defaultDeck'
import type { AxonkeyAndroidBridge } from './transport/nativeBridge'

describe('Axonkey Mobile v5 — Plan B Monolithic UI, Circular Clickpad & Single-Focus Editor', () => {
  it('renders Plan B zero-prose surfaces, Circular Clickpad Ring (tap & swipe), clean Voice Dock, and Light/Dark/System themes', async () => {
    const recenterCursorMock = vi.fn(() => true)
    const setSystemBarThemeMock = vi.fn()
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
      recenterCursor: recenterCursorMock,
      setSystemBarTheme: setSystemBarThemeMock,
      isSystemDarkMode: vi.fn(() => true),
    } satisfies AxonkeyAndroidBridge

    try {
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

      // 1. Minimal Header: HostName + Context AppName, zero geeky badges on keycaps
      expect(screen.getByText('Studio PC')).toBeTruthy()
      expect(screen.getByText('豆包')).toBeTruthy()
      expect(screen.queryByText('Ctrl+Enter')).toBeNull()
      expect(screen.queryByText('HOLD')).toBeNull()

      // 2. Clean Voice Dock: '按住说话' (no '+ 虚拟麦' clutter!)
      expect(screen.getByText('按住说话')).toBeTruthy()
      expect(screen.queryByText(/虚拟麦/)).toBeNull()

      // 3. Circular Clickpad Ring (`触控圆盘`): direct press + >26px swipe + 38px continuous ticks
      const tileActivateSpy = vi.spyOn(useMobileStore.getState().getClient(), 'sendTileActivate')
      const clickpadRing = screen.getByTestId('circular-clickpad-ring')
      const upBtn = within(clickpadRing).getByLabelText('上')

      fireEvent.pointerDown(upBtn, { pointerId: 1, clientX: 110, clientY: 20 })
      fireEvent.pointerUp(upBtn, { pointerId: 1, clientX: 110, clientY: 20 })
      expect(tileActivateSpy).toHaveBeenCalledWith('remote.up', 'tap')

      tileActivateSpy.mockClear()
      hapticMock.mockClear()
      // Swipe right across outer ring: 30px (>26px) triggers 1st right step, +38px triggers 2nd right step!
      fireEvent.pointerDown(clickpadRing, { pointerId: 2, clientX: 80, clientY: 40 })
      fireEvent.pointerMove(clickpadRing, { pointerId: 2, clientX: 110, clientY: 42 }) // +30px -> 1st step
      fireEvent.pointerMove(clickpadRing, { pointerId: 2, clientX: 148, clientY: 43 }) // +38px -> 2nd step
      fireEvent.pointerUp(clickpadRing, { pointerId: 2, clientX: 148, clientY: 43 })
      expect(tileActivateSpy).toHaveBeenCalledTimes(2)
      expect(tileActivateSpy).toHaveBeenNthCalledWith(1, 'remote.right', 'tap')
      expect(tileActivateSpy).toHaveBeenNthCalledWith(2, 'remote.right', 'tap')
      expect(hapticMock).toHaveBeenCalledWith('tap')

      // 4. Pure Matte Trackpad & Calm Air-Mouse
      fireEvent.click(screen.getByText('触控·飞鼠'))
      expect(screen.getByTestId('standalone-trackpad-surface')).toBeTruthy()
      expect(screen.queryByText(/单指丝滑移动/)).toBeNull()

      fireEvent.click(screen.getByLabelText('屏幕归中'))
      expect(recenterCursorMock).toHaveBeenCalledTimes(1)
      expect(screen.getByText('已归中')).toBeTruthy()

      fireEvent.click(screen.getByText('飞鼠'))
      expect(screen.getByText('按住移鼠')).toBeTruthy()
      fireEvent.click(screen.getByText('激光'))
      expect(screen.getByText('激光追踪')).toBeTruthy()

      // 5. Light / Dark / System Theme Switching
      fireEvent.click(screen.getByLabelText('本地手感设置'))
      expect(screen.getByText('偏好设置')).toBeTruthy()

      fireEvent.click(screen.getByText('浅色'))
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(setSystemBarThemeMock).toHaveBeenLastCalledWith(false)

      fireEvent.click(screen.getByText('深色'))
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(setSystemBarThemeMock).toHaveBeenLastCalledWith(true)

      fireEvent.click(screen.getByText('跟随系统'))
      expect(useMobileStore.getState().localFeel.themeMode).toBe('system')
    } finally {
      delete window.AxonkeyNative
    }
  })

  it('supports Single-Focus Contextual Edit Mode: tap tile -> bottom span inspector & TileStyleSheet, tap blank -> deselect, drag reorder & add Circular Clickpad', () => {
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
      pairingOpen: false,
    })

    render(<App />)

    // Enter Single-Focus Edit Mode
    fireEvent.click(screen.getByLabelText('自定义布局'))
    expect(screen.getByTestId('edit-mode-topbar')).toBeTruthy()
    expect(screen.getByText('轻点元素调整属性 · 按住按键拖动换位')).toBeTruthy()

    // Tap tile.continue (initially 2x1) -> bottom contextual inspector shows 1x1 / 2x1 / 1x2 / 2x2 & 编辑
    const continueBtn = document.querySelector('[data-bento-tile-id="tile.continue"]') as HTMLElement
    expect(continueBtn).toBeTruthy()
    fireEvent.click(continueBtn)
    const dock = screen.getByTestId('edit-inspector-dock')
    expect(within(dock).getByText('已选：继续执行')).toBeTruthy()

    // 1-tap span change to 1×2 in bottom inspector
    fireEvent.click(within(dock).getByText('1×2'))
    const updatedTile = useMobileStore
      .getState()
      .deck.pages.find((p) => p.id === 'vibe-coding')!
      .tiles.find((t) => t.id === 'tile.continue')!
    expect(updatedTile.colSpan).toBe(1)
    expect(updatedTile.rowSpan).toBe(2)

    // Open TileStyleSheet via '编辑' button in bottom inspector
    fireEvent.click(within(dock).getByText('编辑'))
    expect(screen.getByText('编辑按键')).toBeTruthy()
    expect(screen.getByText('电脑端绑定')).toBeTruthy()
    fireEvent.click(screen.getByText('持续按住 Hold'))
    expect(
      useMobileStore
        .getState()
        .deck.pages.find((p) => p.id === 'vibe-coding')
        ?.tiles.find((t) => t.id === 'tile.continue')?.mode,
    ).toBe('hold')
    fireEvent.click(within(screen.getByRole('dialog', { name: '编辑按键' })).getByText('完成'))

    // Tap blank stage background -> deselects back to calm 1-line prompt!
    fireEvent.click(screen.getByTestId('main-stage'))
    expect(useMobileStore.getState().selectedEditItem).toBeNull()
    expect(screen.getByText('轻点元素调整属性 · 按住按键拖动换位')).toBeTruthy()

    // Drag-and-drop reorder via pointerdown + >8px pointermove + elementFromPoint + pointerup
    const enterBtn = document.querySelector('[data-bento-tile-id="tile.enter"]') as HTMLElement
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

    // Insert 触控圆盘 via [+ 组件 -> 触控圆盘]
    fireEvent.click(screen.getByText('组件'))
    fireEvent.click(screen.getByText('触控圆盘'))
    expect(screen.getByTestId('circular-clickpad-ring')).toBeTruthy()
    expect(within(screen.getByTestId('edit-inspector-dock')).getByText('触控圆盘')).toBeTruthy()

    // Create geometric '触控板混排' page via PageManagerSheet ([+] in edit topbar)
    fireEvent.click(screen.getByLabelText('页面管理'))
    expect(screen.getByText('页面管理')).toBeTruthy()
    fireEvent.click(screen.getByText('触控板混排'))

    // Exit edit mode -> embedded matte trackpad + shortcut tiles render cleanly
    fireEvent.click(screen.getByText('完成'))
    expect(screen.getByTestId('embedded-trackpad-surface')).toBeTruthy()
    expect(screen.getByLabelText('归中')).toBeTruthy()
    expect(screen.getByText('主动作')).toBeTruthy()
  })

  it('dismisses all BottomSheets immediately on backdrop click, swipe-down, Escape, and Android Back', () => {
    useMobileStore.setState({
      phase: 'active',
      isDemoMode: true,
      feelSheetOpen: false,
      pairingOpen: false,
      aboutSheetOpen: false,
    })

    render(<App />)

    // 1. PairingSheet closes on backdrop click
    fireEvent.click(screen.getByLabelText('连接与配对'))
    expect(screen.getByRole('dialog', { name: '设备连接' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('pairing-sheet-backdrop'))
    expect(screen.queryByRole('dialog', { name: '设备连接' })).toBeNull()

    // 2. LocalFeelSheet closes on backdrop click
    fireEvent.click(screen.getByLabelText('本地手感设置'))
    expect(screen.getByRole('dialog', { name: '偏好设置' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('feel-sheet-backdrop'))
    expect(screen.queryByRole('dialog', { name: '偏好设置' })).toBeNull()

    // 3. AboutUpdateSheet closes on backdrop click
    fireEvent.click(screen.getByLabelText('本地手感设置'))
    fireEvent.click(screen.getByLabelText('关于与版本更新'))
    expect(screen.getByRole('dialog', { name: '关于与版本更新' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('about-sheet-backdrop'))
    expect(screen.queryByRole('dialog', { name: '关于与版本更新' })).toBeNull()

    // 4. Swipe-down (>48px) on grabber handle & Android native Back hook close sheet
    fireEvent.click(screen.getByLabelText('本地手感设置'))
    const handle = screen.getByTestId('bottom-sheet-handle')
    fireEvent.pointerDown(handle, { pointerId: 7, clientY: 120 })
    fireEvent.pointerMove(handle, { pointerId: 7, clientY: 180 })
    fireEvent.pointerUp(handle, { pointerId: 7, clientY: 180 })
    expect(screen.queryByRole('dialog', { name: '偏好设置' })).toBeNull()

    fireEvent.click(screen.getByLabelText('连接与配对'))
    expect(screen.getByRole('dialog', { name: '设备连接' })).toBeTruthy()
    act(() => {
      window.__axonkeyNativeOnBack?.()
    })
    expect(screen.queryByRole('dialog', { name: '设备连接' })).toBeNull()
  })

  it('supports Mid-Grip Air-Mouse, Edge Rotary Scroll, Click Stabilizer, Volume Keys, AboutUpdateSheet & Split Landscape', async () => {
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

    try {
      window.localStorage.clear()
      render(<App />)

      await act(async () => {
        useMobileStore.getState().connectDemo()
        await new Promise((r) => setTimeout(r, 35))
      })

      // Air-Mouse Mid-Grip + Handedness + Click Stabilizer + Edge Encoder + Volume Keys
      fireEvent.click(screen.getByText('触控·飞鼠'))
      fireEvent.click(screen.getByText('飞鼠'))

      const midGrip = screen.getByTestId('airmouse-midgrip-layout')
      expect(midGrip.getAttribute('data-handedness')).toBe('right')
      fireEvent.click(screen.getByLabelText('切换飞鼠左右手握持'))
      expect(midGrip.getAttribute('data-handedness')).toBe('left')

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

      fireEvent.click(screen.getByLabelText('本地手感设置'))
      fireEvent.click(screen.getByText('左 / 右键'))
      expect(setVolumeConfigMock).toHaveBeenLastCalledWith(false, 'lr')

      fireEvent.click(screen.getByTestId('feel-sheet-backdrop'))
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

      // AboutUpdateSheet check + download + permission_required flow
      fireEvent.click(screen.getByLabelText('本地手感设置'))
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
            notes: '- Plan B 一体成型重构',
            publishedAt: '2026-11-24T00:00:00Z',
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
        fireEvent.click(screen.getByLabelText('本地手感设置'))
        fireEvent.click(screen.getByText('横屏台架'))
        expect(setOrientationMock).toHaveBeenLastCalledWith('landscape')
        fireEvent.click(screen.getByTestId('feel-sheet-backdrop'))
        expect(screen.getByTestId('split-landscape-shell')).toBeTruthy()
      } finally {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: origW })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: origH })
      }
    } finally {
      delete window.AxonkeyNative
    }
  })
})
