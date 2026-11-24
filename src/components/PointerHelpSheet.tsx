import { BottomSheet } from './BottomSheet'
import { useMobileStore } from '../state/useMobileStore'

const TOUCHPAD_GESTURES: readonly { gesture: string; action: string }[] = [
  { gesture: '单指滑动 / 轻点', action: '移动光标 / 左键单击' },
  { gesture: '双击不松手拖动', action: '框选或拖拽窗口（亦可点锁头锁定）' },
  { gesture: '双指轻点 / 滑动', action: '右键菜单 / 上下左右滚轮' },
  { gesture: '三指上滑 / 下滑', action: '任务视图 (Win+Tab) / 显示桌面' },
  { gesture: '三指左右滑 / 轻点', action: '切换虚拟桌面 / 鼠标中键' },
]

const AIRMOUSE_TIPS: readonly { gesture: string; action: string }[] = [
  { gesture: '惯性飞鼠', action: '按住下方感应区挥腕移鼠，松手悬停防抖' },
  { gesture: '激光飞鼠', action: '如激光笔实时指向屏幕，偏离时点「归中」' },
  { gesture: '侧边刻度条', action: '上下滑动步进滚轮，轻点触发鼠标中键' },
  { gesture: '实体音量键', action: '可在「指针设置」中映射为左右键或滚轮' },
]

export function PointerHelpSheet() {
  const open = useMobileStore((s) => s.pointerHelpOpen)
  const setOpen = useMobileStore((s) => s.setPointerHelpOpen)

  return (
    <BottomSheet
      open={open}
      onClose={() => setOpen(false)}
      title="操控手势说明"
      closeAriaLabel="关闭手势说明"
      testId="pointer-help-sheet-backdrop"
    >
      <div className="space-y-1.5">
        <span className="ak-text-2 text-xs font-medium block">触控板多指手势</span>
        <div className="ak-well rounded-[18px] border divide-y divide-black/[0.04] dark:divide-white/[0.05]">
          {TOUCHPAD_GESTURES.map((row) => (
            <div
              key={row.gesture}
              className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <span className="ak-text-1 font-medium shrink-0">{row.gesture}</span>
              <span className="ak-text-2 text-right">{row.action}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="ak-text-2 text-xs font-medium block">飞鼠与侧边滚轮</span>
        <div className="ak-well rounded-[18px] border divide-y divide-black/[0.04] dark:divide-white/[0.05]">
          {AIRMOUSE_TIPS.map((row) => (
            <div
              key={row.gesture}
              className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <span className="ak-text-1 font-medium shrink-0">{row.gesture}</span>
              <span className="ak-text-2 text-right">{row.action}</span>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
