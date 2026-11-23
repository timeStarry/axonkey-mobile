import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { App } from './App'
import { useMobileStore } from './state/useMobileStore'
import { DEFAULT_DEMO_DECK } from './transport/defaultDeck'

describe('Axonkey Mobile v2 UI', () => {
  it('renders thumb-zone navigation, dynamic voice binding badge, dual-mode gyro sub-modes, and LocalFeelSheet', () => {
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

    // Switch to 触控·空鼠 workspace via thumb-zone segmented bar
    fireEvent.click(screen.getByText('触控·空鼠'))
    expect(screen.getByText('触控板')).toBeTruthy()
    expect(screen.getByText('体感空鼠')).toBeTruthy()
    expect(screen.getByText('归中瞄准')).toBeTruthy()

    // Switch sub-modes: 体感空鼠 -> Hold Clutch; 归中瞄准 -> One-tap Recenter
    fireEvent.click(screen.getByText('体感空鼠'))
    expect(screen.getByText('按住体感移动（离合键）')).toBeTruthy()

    fireEvent.click(screen.getByText('归中瞄准'))
    expect(screen.getByText('指向屏幕中心 · 一键归中')).toBeTruthy()

    // Open LocalFeelSheet via header gear icon
    fireEvent.click(screen.getByLabelText('本地手感设置'))
    expect(screen.getByText('本地操控手感')).toBeTruthy()
    expect(screen.getByText(/按键映射在电脑端实时配置/)).toBeTruthy()
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

    // Exit edit mode and verify embedded trackpad + shortcut tiles render together on one page
    fireEvent.click(screen.getByText('完成'))
    expect(screen.getByText('单指移动 · 轻点左键 · 双指滚轮')).toBeTruthy()
    expect(screen.getByText('主动作')).toBeTruthy()
  })
})
