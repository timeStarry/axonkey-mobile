# Axonkey Mobile

Axonkey 的移动端动态可编程触控输入源（v0.1.0）。

## 核心能力
- **动态丝印 Deck 面板**：实时同步桌面端配置、页签与当前前台应用上下文；支持在手机端直接自定义按键名称、副标题、受控图标、配色与 1×1 / 2×1 跨列布局，并通过乐观锁（`baseRevision`）安全回写桌面。
- **相对多点触控板**：单指移动（60Hz 批次合并 + 桌面纯相对 `MOUSEEVENTF_MOVE` 亚像素余量）、单指轻点左键、双指轻点右键、双指滚动、拖拽锁定。
- **快捷文本与手机语音听写直推**：直接调用手机原生输入法语音听写，一键粘贴/键入并回车直达 Cursor / Claude Code / Codex 输入框（零虚拟麦克风驱动依赖）。
- **端到端安全与防卡键**：基于桌面安装级私有 CA 的 WSS (`axonkey.mobile/1`) 扫码建信，250ms 心跳 / 750ms Lease 过期拒绝，锁屏/切后台立即触发 `input.cancel` 撤销屏障。

## 开发与验证
```bash
pnpm install
pnpm check         # 类型检查 + Vitest 单元测试 + 生产包构建
pnpm dev           # 本地浏览器调试（内置 Demo 模拟桌面端）
pnpm sync:android  # 构建 Web 产物并同步至 android/app/src/main/assets/web/
```
