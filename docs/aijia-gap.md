# Telegram IM 功能差距（AIjia vs OpenClaw）

> 对比基准：lotus-app（本机 Tauri 桌面端）vs OpenClaw 官方内置 Telegram extension（`openclaw/openclaw/extensions/telegram/`）
> 更新时间：2026-06-16

## AIjia 已有的功能

- 私聊文字收发（私聊 bot 后配对通过即可提问）
- 图片和文件的接收与发送
- Bot Token 注册 + 扫码配对（深链二维码 + 审核通过/拒绝/撤销）
- 基础白名单准入控制
- 基础错误重试和断线恢复

## AIjia 还没有的功能

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 群里 @ 机器人 | 当前只支持私聊，群里 @ 机器人没有任何响应，无法作为群机器人使用 | 高 |
| 群 Topic / 线程会话 | 群内 Topic/线程互相串话，没有独立对话隔离 | 高 |
| 语音、视频、贴纸消息 | 用户发语音/视频/贴纸时，只收到"不支持"提示，无法进入 AI 流程 | 高 |
| 多 bot / 多账号 | 一个应用只能配一个 Telegram bot，无法支持多团队或多机器人并行 | 高 |
| 回复中状态（打字指示） | 用户等待时看不到"正在回复"状态，长回答等待体验差 | 中 |
| Inline Buttons（消息内按钮） | 审批、选择、确认类操作无法在消息内完成，体验比 OpenClaw 弱 | 中 |
| Bot 命令菜单（/ 命令提示） | 用户输入 `/` 时没有完整命令菜单，不容易发现可用操作 | 中 |
| Webhook 部署模式 | 只有长轮询，需要本机持续运行拉取消息；OpenClaw 同时支持 Webhook，云端部署更灵活 | 中 |
| 流式/进度回复 | 无法边生成边展示，只能等最终结果发出 | 中 |
| 更多媒体类型入站 | 视频、语音、贴纸、动图等无法进入 AI 对话流程，只有图片和文件支持 | 高 |
| 失败消息恢复与重排 | 网络中断或重启后的消息丢失恢复比 OpenClaw 弱 | 中 |

## 说明

- OpenClaw Telegram 参考源码：`openclaw/openclaw/extensions/telegram/`（内置 extension，非独立插件）
- 本仓库（`openclaw-channel-telegram-userbot`）是 MTProto 用户协议实现，与 OpenClaw 官方 Bot API 实现不同；差距文档以 OpenClaw 官方实现为基准
- AIjia lotus-app 使用 Bot API（与 OpenClaw 一致），当前进度约 PR3 阶段（仅私聊 MVP）
