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
})
