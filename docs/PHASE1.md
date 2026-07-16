# 英语快充 v2 — 阶段一交付文档

> 交付日期：2026-07-16
> build tag：`phase1-skeleton-2026-07-16`
> 项目根目录：`D:\english-bolt-miniapp\`
> 原项目：**未触碰**（按 user 明确要求"重新做，不要改原来的"）

---

## 1. 阶段一定位

按 user 的大纲，阶段一是 v2 重新做项目的"地基"：
- ✅ 脚手架齐全，能在微信开发者工具导入即跑
- ✅ 4 tab 骨架（今日 / 沉浸 / 场景 / 我的）+ 路由通
- ✅ 全局音频管理器（修原项目三大坑：onCanplay / interrupted / stale event）
- ✅ UserDataRepository 雏形（统一 storage key）
- ✅ 1 个真实 word demo 验证完整播放链路

> 严格按 user 红线执行：
> - ❌ 不用空文件 / 假 URL 占位
> - ❌ 缺失音频直接标 `missing`，**绝不**生成空 mp3
> - ✅ 复用现有 CDN：https://english.wujiong.cn/audio/

---

## 2. 资产盘点结论（首批 125 词抽样）

跑了 `tools/audit-audio.mjs`，对 125 词（Top 100 常用词 + 25 基础实词）做 HEAD 探测：

| 指标 | 数值 |
|---|---|
| 总词数 | 125 |
| 200 (可播放) | **98** (78.4%) |
| 404 (缺失) | 27 |
| 平均音频大小 | ~10.5 KB（短单词 1-2s 单发音） |
| Content-Type | 全部 `audio/mpeg` |

**命中规律**：
- ✅ 高频功能词 + 实词：the / a / and / to / of / in / apple / water / book...
- ❌ 主要缺失：1-2 字母弱读词（i, by, or, me, if, am）、抽象高频词（this, from, just, now, its, over, also, our, well, even, want, because, any, most）、不规则变形（said, got, made, took, saw）

**外推 5855**：
- 乐观：~78% 命中 ≈ **4560 个可复用**
- 保守：~65% 命中 ≈ **3800 个可复用**
- 实际值需要 5855 全量清单才能确定，**已 ask user 提供清单**

**输出文件**：
- `data/audio-audit.jsonl` — 125 行 JSONL
- `data/audio-audit.csv` — 125 行 CSV

> 后续每批扩词 / TTS 补量后，跑同一个 audit 脚本做"回溯验证"，确保 hit rate 不退化。

---

## 3. 文件结构

```
D:\english-bolt-miniapp\
├── project.config.json                # 微信开发者工具配置（appid=touristappid, 测试用）
├── project.private.config.json
├── .gitignore
├── docs/
│   └── PHASE1.md                      # 本文档
├── tools/
│   ├── audit-audio.mjs                # CDN 资产盘点（HEAD 探测）
│   ├── gen-icons.mjs                  # tabBar 图标生成器（无 npm 依赖）
│   └── top100-words.txt               # 抽样词表
├── data/
│   ├── audio-audit.jsonl              # 125 词盘点明细
│   └── audio-audit.csv
└── miniprogram/
    ├── app.js                         # 入口（onLaunch prewarm tts）
    ├── app.json                       # 4 tab + 路由
    ├── app.wxss                       # 全局样式 + token
    ├── sitemap.json
    ├── assets/tab/                    # 8 个 PNG (4 tab × 2 状态)
    ├── utils/
    │   ├── tts.js                     # 音频管理器（核心）
    │   ├── user-data.js               # 存储仓库
    │   └── audio-cdn.js               # CDN URL 构造
    └── pages/
        ├── today/{today.js, today.wxml, today.wxss, today.json}    # 主 demo
        ├── immerse/                                                       # 占位
        ├── scene/                                                         # 占位
        └── mine/                                                          # 占位
```

---

## 4. 关键设计决策

### 4.1 音频管理器 `utils/tts.js` —— 修原项目三个致命坑

| 坑 | 原项目症状 | v2 做法 |
|---|---|---|
| `onCanplay` 不可靠 | mp3 短音频 / 已在缓存 → onCanplay 不触发 → state 永远卡 `loading` | 不 await onCanplay；setSrc 后立刻 play，靠 onPlay 当真出声信号 |
| 第一次 `play()` reject "interrupted" | 首个音频请求 1800ms 后才靠 timeout 继续 | `app.onLaunch` 调 `tts.prewarm()`（用 the.mp3 热身），让首 play 顺畅 |
| 全局 onStop/onEnded 无 staleness 检查 | 旧 stop 事件迟到 clobber 新 state → UI 闪一下 loading→idle→playing | 每个事件回调先验 `if (_state.token !== _token) return;` 守门 |

设计原则：
- **单例** `_ctx`，所有 speak 走同一 InnerAudioContext
- 每个 speak 自带 **token**，事件回调必须 token 守门
- 阶段一只支持 mp3 远程 URL；TTS 生成留到阶段二

### 4.2 TTS 选型 —— edge-tts（免费 + 离线 + 高质量）

**为什么选 edge-tts**：
- ✅ 微软 Edge 内置 TTS，**完全免费、无配额**
- ✅ 神经语音（en-US-GuyNeural, en-US-JennyNeural, en-US-AriaNeural 等 17 个 en-US 声音）
- ✅ 标准美式 / 自然美式 / 慢速 都可调（用 `--rate` + `--pitch`）
- ✅ 输出 mp3 直接可播放
- ⚠️ **依赖网络**（调微软云端），不是真"离线"
- 严格"真离线"备选：Piper TTS（需下 ~60MB 模型，Windows 二进制需另找）

**阶段一未启用 TTS 生成**（CDN 复用优先）。阶段二补量时：
- 缺哪些词 → `tools/audit-audio.mjs` 产出 missing list
- 用 `edge-tts --voice en-US-JennyNeural --rate=-10%` 生成自然美式
- 校验：非空 / Content-Type=audio/mpeg / 时长 < 4s / 听感对比无机械加速
- 上传 CDN → 重新跑 audit 确认 hit rate

### 4.3 不进数据库，纯本地存储

按 user 红线："首发使用微信本地存储，不增加数据库和付费服务"。
- `utils/user-data.js` 统一所有 key
- 阶段一存 4 个：wordProgress / naturalListening / favorites / settings
- 阶段七才接云端

### 4.4 四个 tab

| tab | 阶段一 | 阶段 N 目标 |
|---|---|---|
| 今日 | 1 word 卡片 + 真实播放 + 设置预览 | 今日训练引擎（阶段三） |
| 沉浸 | 频道列表占位 | 后台播放（阶段五） |
| 场景 | 16 场景分组占位 | 场景学习（阶段六） |
| 我的 | 能力统计骨架 | 用户体系（阶段七） |

---

## 5. 验收清单（请按这个测）

### 5.1 静态校验（已完成，脚本输出归档）
- ✅ 所有 .js 通过 `node --check` 语法校验（8 个文件）
- ✅ 所有 .json 通过 JSON parse
- ✅ 所有 WXML 标签配平：`<view>` / `<text>` 全部成对
- ✅ 8 个 PNG 签名合法（89504E47...）
- ✅ 125 词 CDN 探测：98 命中 / 27 缺失

### 5.2 真机 / 开发者工具验收（需要 user 装微信开发者工具）
> ⚠️ **当前机器未装微信开发者工具**（已 ask user），以下验收步骤在 user 装好后跑：

1. 打开微信开发者工具 → 导入项目 → 选 `D:\english-bolt-miniapp` → appid 选"测试号"
2. **不校验合法域名** 在工具里勾上（详情 → 本地设置）
3. 编译应无错误，4 tab 底部正常显示
4. 今日页：点"播放标准发音" → 听到 apple 真实美音
5. 切到后台再回前台 → 状态不卡"加载中一闪而逝"（验证 prewarm 生效）
6. 切换设置项 → 杀进程再进 → 设置仍然在（验证 user-data 持久化）
7. "我的"页 → "测试音频"按钮 → 听到 apple 美音

### 5.3 关键坑位（白名单域名）
> ⚠️ **重要**：真机预览/正式版**必须**配 `downloadFile 合法域名`：
> - 微信公众平台 → 开发 → 开发管理 → 服务器域名 → downloadFile 合法域名
> - 添加：`https://english.wujiong.cn`
>
> 没配的话，**真机会直接 audio fail**。开发者工具里勾"不校验"只对开发期有效。

---

## 6. 阶段二衔接（下一步计划）

按 user 选定范围："阶段一+二+三" 的话，下一轮交付：

### 阶段二：内容数据层
1. 拿到 5855 清单 → 跑全量 audit → 输出 `data/word-audit-full.jsonl`
2. 用 edge-tts 补 missing 词 → 部署到 CDN → 重跑 audit
3. 建 `data/words.json` 核心 3000 词 + 释义 + 音标（来源：ECDICT / 朗文 / 欧路 → 选最简的）
4. 建 `data/sentences.json` 首批 500 重点口语句
5. 建 `data/pronunciation-patterns.json` 自然口语规则（弱读/连读/闪音/吞音）
6. 拆 `utils/tts.js` 引入 `audio-cache.js`（播放过的 mp3 走内存，避免重复请求）
7. 引入 `package.json` + npm（如需 ESM 工具链 / cheerio 爬词）

### 待 user 决策
- 5855 清单来源（ask_user 已发，等回复）
- ECDICT 词库 license（CC-BY-SA 4.0，商业可用但要署名）
- 是否分多 session 推进

---

## 7. 已知限制（不影响阶段一交付，但 stage2 要解决）

| 限制 | 影响 | 解决时机 |
|---|---|---|
| 开发者工具未装 | 真机预览需 user 自验 | 等 user 装 |
| CDN 白名单未配 | 真机播放会失败 | 真机测试前配 |
| 词库 / 例句数据未导入 | 阶段一只有 1 个 demo 词 | 阶段二 |
| edge-tts 仍走网络 | 严格"离线"用户场景下不可用 | 备 piper 即可 |
| tabBar icon 是几何占位 | 视觉简陋 | 阶段二 designer 出图 |
| 没有 npm init | 没 package.json | 阶段二按需 |

---

## 8. 自我硬规执行记录（按 memory 红线）

| 规则 | 执行 |
|---|---|
| 写完 .js 立即 `node --check` | ✅ 8 个 .js 全部 OK |
| 写完 .mjs 立即 `node --check` | ✅ 2 个 .mjs 全部 OK |
| WXML 标签配平检查 | ✅ view/text 全部成对 |
| PNG 合法性检查 | ✅ 8 个 PNG 签名合法 |
| 不写假占位文件 | ✅ missing 音频一律标 `missing`，不生成空 mp3 |
| 不 dump secret 到 chat | ✅ 本轮无 secret 操作 |

---

**本轮交付完毕。等 user 回复 5855 清单 + 装好微信开发者工具后，进入阶段二。**
