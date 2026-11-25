# Axonkey Mobile · 无线快捷控制面板与虚拟麦克风客户端

将 Android 手机变成 [Axonkey 桌面端](https://github.com/leowzz/axonkey) 的低延迟无线遥控器、动态快捷面板、空中飞鼠与 16kHz 虚拟麦克风输入源。无需外接物理遥控器，即可在电脑前或沙发上为 Cursor、Claude Code、Codex、豆包等工具完成快捷键触发与按住说话输入。

[![Release](https://img.shields.io/github/v/release/timeStarry/axonkey-mobile?style=flat&color=blue)](https://github.com/timeStarry/axonkey-mobile/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/timeStarry/axonkey-mobile/build-tag.yml?style=flat&label=release)](https://github.com/timeStarry/axonkey-mobile/actions/workflows/build-tag.yml)
[![CI](https://img.shields.io/github/actions/workflow/status/timeStarry/axonkey-mobile/ci.yml?style=flat&label=ci)](https://github.com/timeStarry/axonkey-mobile/actions/workflows/ci.yml)
[![Android 8.0+](https://img.shields.io/badge/Android-8.0%2B%20(API%2026%2B)-3DDC84?style=flat&logo=android&logoColor=white)](#系统要求)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat)](./LICENSE)

[**⬇ 下载 Axonkey Mobile（Android APK）**](https://github.com/timeStarry/axonkey-mobile/releases) · [**⬇ 下载 Axonkey 桌面端（Windows / macOS）**](https://github.com/leowzz/axonkey/releases)

## 核心功能

- **三大操控工作区**：
  - **遥控器**：触控圆盘（四向 1/4 扇区按压 + 中心确认）搭配快捷功能键，贴合单手盲操直觉。
  - **快捷面板**：实时同步桌面端按键丝印与当前前台应用配置；支持在手机端直接编排按键网格、手势垫、内嵌触控板及 1×1 / 2×1 / 2×2 键帽尺寸，并通过乐观锁（`baseRevision`）安全回写桌面。
  - **触控 · 飞鼠**：多点触控板（单指移动、双指滚动、锁定拖拽、三指系统手势）与基于传感器融合的陀螺仪空中飞鼠（支持按住离合、左右手切换及音量实体键充当鼠标左/右键）。
- **双模语音与文本直推**：
  - **16kHz 虚拟麦克风实时推流（`AKA1`）**：按住底部说话键，手机麦克风音频通过二进制帧实时注入电脑端 `Quarbor Virtual Microphone`，同时自动按住桌面端绑定的唤醒快捷键（如豆包语音输入 `Alt` 或 Windows 听写 `Win+H`）。
  - **手机键盘/听写文本直推**：支持调用手机输入法输入或语音转文字，一键粘贴或模拟键入至电脑当前焦点输入框。
- **局域网私有加密与防卡键保护**：
  - 基于桌面端私有 CA 证书的 `WSS`（`axonkey.mobile/1`）端到端加密通道，配合局域网 `UDP 49671` 自动发现，路由器分配 IP 变动后无需重新扫码。
  - 250ms 租约心跳、代际隔离（`inputEpoch` / `inputGeneration`）与切后台即时 `input.cancel` 撤销屏障，杜绝断线卡键或按键粘滞。
- **双端版本兼容协商与应用内自更新**：
  - 握手阶段自动协商双端协议版本（兼容范围内完全静默；跨版本差异提示升级建议；不兼容协议版本拦截连接并明确提示需更新哪一端）。
  - 内置 GitHub Release 更新检查、下载进度展示与 `SHA-256` 完整性校验安装。

## 系统要求

| 端侧 | 要求与说明 |
| --- | --- |
| **手机端** | Android 8.0（API 26）及以上；相机权限仅用于扫码配对，麦克风权限仅在按住说话时采集 |
| **电脑端** | 已安装并运行支持移动端的 [Axonkey 桌面端](https://github.com/leowzz/axonkey)（推荐 `v1.9.0+`）；Windows 使用实时虚拟麦克风需按桌面端引导安装虚拟麦克风驱动 |
| **网络环境** | **手机与电脑需连接在同一局域网（同一 Wi‑Fi 或手机热点）下**，且网络未开启 AP 隔离 |

## 快速开始

1. **同一局域网准备**：将手机与电脑连接至同一个 Wi‑Fi（或手机直接开启热点供电脑连接）。
2. **扫码配对**：
   - 在电脑端打开 Axonkey，添加或进入 **Axonkey Mobile** 设备页，点击 **配对** 打开加密配对二维码。
   - 在手机端打开 Axonkey Mobile，点击顶栏状态胶囊打开设备连接面板，点击 **扫码连接新电脑** 扫描桌面二维码即可完成绑定并自动建连。
3. **配置快捷键与豆包/AI 语音输入**：
   - 在桌面端 Axonkey 的设备映射页点选任意按键或“按住说话”，即可绑定快捷键、组合动作或预设方案。
   - 若搭配电脑端豆包语音输入：在豆包设置中确认语音输入快捷键为 `Alt`，并将输入麦克风选为 `Quarbor Virtual Microphone`，即可按住手机底部说话键直接口述上屏。

## 源码开发与构建

### 环境要求

- Node.js `22+` 与 `pnpm 10+`
- JDK `17` 与 Android SDK（`compileSdk 35`）

### 常用命令

```bash
pnpm install          # 安装前端依赖
pnpm check            # 校验版本号一致性 + TypeScript 类型检查 + Vitest 单元测试 + Web 生产构建
pnpm sync:android     # 构建前端静态资源并同步至 android/app/src/main/assets/web/

# 构建 Android 安装包（在 android/ 目录下执行）
cd android
./gradlew :app:assembleDebug    # 构建调试包
./gradlew :app:assembleRelease  # 构建开启 R8 代码混淆与资源压缩的精简正式包
```

## 版本管理与自动化发布

仓库采用与 [Axonkey 主仓库](https://github.com/leowzz/axonkey) 一致的单源版本号校验与 Tag 驱动签名发布机制：

1. **同步更新版本号**（同步写入 `package.json`、`android/app/build.gradle.kts` 与前端回退版本元数据，并自动递增 `versionCode`）：
   ```bash
   pnpm version:set v0.3.0
   pnpm check
   ```
2. **配置仓库签名密钥（GitHub Actions Secrets）**：
   为保证应用内自更新（`PackageInstaller`）跨版本覆盖安装签名一致，首次在 GitHub 发布前请在仓库 `Settings → Secrets and variables → Actions` 中配置以下持久签名密钥：

   | Secret 名称 | 说明 |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | Release 签名证书（`.jks` / `.keystore`）的 Base64 编码字符串 |
   | `ANDROID_KEYSTORE_PASSWORD` | Keystore 密码 |
   | `ANDROID_KEY_ALIAS` | 密钥别名（Key Alias） |
   | `ANDROID_KEY_PASSWORD` | 密钥密码（Key Password） |

3. **推送 Tag 触发正式或预发布构建**：
   ```bash
   git commit -am "chore(release): v0.3.0"
   git tag v0.3.0
   git push origin master v0.3.0
   ```
   推送 `v*` 标签后，[`.github/workflows/build-tag.yml`](.github/workflows/build-tag.yml) 会自动完成版本一致性核验、Vitest 测试门禁、R8 精简签名打包、`apksigner` 签名验证、`.sha256` 摘要生成与 GitHub Release 发布（`-alpha.N` / `-beta.N` / `-rc.N` 自动标记为 Pre-release）。

## 开源许可与致谢

- 本项目与上游主仓库 [leowzz/axonkey](https://github.com/leowzz/axonkey) 保持一致，采用 [**GNU General Public License v3.0 only (`GPL-3.0-only`)**](./LICENSE) 开源许可协议。
- 第三方运行时依赖及其许可证说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
