# Vocora

按 [用户大纲](docs/PHASE1.md) 重新做的微信小程序，**不依赖**原项目代码。

## 当前进度

✅ **阶段一：脚手架 + 首页骨架**（2026-07-16 交付）

## 快速开始

```bash
# 1. 打开微信开发者工具
# 2. 导入项目：D:\english-bolt-miniapp
# 3. appid 选 "测试号"
# 4. 详情 → 本地设置 → 勾上 "不校验合法域名"
# 5. 编译运行
```

## 工具脚本

```bash
# 盘点 CDN 音频可用性
node tools/audit-audio.mjs --candidates tools\top100-words.txt

# 用更大词表（按句法切分过的 500 词）
node tools/audit-audio.mjs --candidates your-wordlist.txt --concurrency 16

# 重新生成 tabBar 图标
node tools/gen-icons.mjs
```

## 关键红线

- ❌ 不用空 mp3 / 假 URL 占位 — 找不到就标 `missing`
- ✅ 复用现有 CDN：https://english.wujiong.cn/audio/
- ✅ 新增音频用 edge-tts（免费神经 TTS）
- ✅ 一切写在 user-data.js 集中管理

## 详细文档

- [docs/PHASE1.md](docs/PHASE1.md) — 阶段一交付 / 验收 / 阶段二衔接
