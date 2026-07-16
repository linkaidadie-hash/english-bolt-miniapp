# 英语快充 v2 — 阶段三交付报告

> 交付日期：2026-07-17
> build tag: `phase3-train-engine-2026-07-17`
> 上一阶段：[PHASE2.md](PHASE2.md) + [PHASE2 真实验收] 见下

---

## 1. 阶段三定位

按 [PROJECT-OUTLINE.md](PROJECT-OUTLINE.md) 阶段三："**每日主动学习引擎** — 预计 6~10 个有效开发日"。

**本轮 MVP 范围**（与 user 选 "keep-p2-thin" 一致）：
- ✅ 5 维度 wordProgress schema（不含 naturalListen 数据，但字段预留）
- ✅ 间隔复习算法 (SRS) — 当天/1天/3天/7天/21天
- ✅ 听音辨词训练（**仅 830 ready 词**，避免依赖 2170 missing）
- ✅ 拼写检测（含 Levenshtein 模糊匹配，长词允许 1 typo）
- ✅ 错题回炉（拉最近 100 条 quality=forgot 去重）
- ✅ 训练统计 + 答题流水持久化
- ✅ 5 维度能力进度（mine 页）
- ❌ 自然口语解码（阶段四）
- ❌ 跟读录音（阶段四）
- ❌ 句子排序（阶段四 + sentence 数据）
- ❌ 现实英语任务（阶段八）

---

## 2. 关键设计决策

### 2.1 5 维度 wordProgress schema
```js
{
  firstAt: number,         // 首次见到时间
  lastAt: number,          // 最后一次互动
  exposure: number,        // 见过次数
  recall: number,          // 认对次数（4 选 1 / 释义匹配）
  spell: number,           // 拼对次数（严格匹配）
  listen: number,          // 听音辨词对次数
  speak: number,           // 主动说对次数（阶段四）
  naturalListen: number,   // 自然口语听对次数（阶段四）— 字段已保留
  status: 'new' | 'learning' | 'reviewing' | 'mastered' | 'failed',
  dueAt: number,           // 下次复习时间戳
}
```

**自然听读 (naturalListen) 字段已保留**，阶段四 TTS 补量后填数据，**不破坏现有 schema**。

### 2.2 SRS 算法（按 PROJECT-OUTLINE 表）
| 评分 | 下次复习 | 状态 |
|---|---|---|
| `forgot` (完全忘记) | +10 分钟 | `learning` |
| `vague` (模糊) | +1 天 | `learning` |
| `remembered` (基本记住) | +3 天 | `reviewing` |
| `proficient` (熟练) | +7 天 | `reviewing` |
| `fluent` (能听会说) | +21 天 | `mastered` |

**MVP 简化**：
- 听音辨词 / 错题回炉 = 二元评分（对/错 → remembered / forgot）
- 拼写 = 三元评分（完全对 → remembered / 1 字符 typo → vague / 错 → forgot）
- 阶段四扩展：跟读评分（fluent / proficient / vague / forgot 四档）

### 2.3 训练源仅用 830 ready 词
- **不依赖 2170 missing**（按 user 选 "keep-p2-thin"）
- `trainer.getReadyWords()` 只筛 `audio.status === 'ready' && level in [1,2,3,4]`
- 拼写 / 听音 / 错题 / 回炉 全部用这个池
- 阶段四 TTS 补 2170 后，trainer 自动扩到 3000

### 2.4 持久化策略
- 每次答题后立即 `wx.setStorageSync(KEYS.wordProgress, all)` — 不等批量
- 训练流水 `KEYS.trainingLog.history` 限 2000 条（防爆 wxapkg）
- 训练 log 提供错题回炉 + 答题统计的源数据

### 2.5 不依赖 2170 missing 的训练闭环
- 听音辨词：必须用 ready 词（因为播音频）— **已强制**
- 拼写检测：用 ready 词，display 释义+IPA
- 错题回炉：拉 quality=forgot 的 history，但**只回 ready 词**（filter）

> 这意味着训练 100% 走 ready 子集。阶段四补 2170 后，训练池自动从 830 → 3000。

---

## 3. 关键数字

| 指标 | 数值 |
|---|---|
| wordProgress 维度 | 5（recall/spell/listen/speak/naturalListen） |
| SRS 评分档 | 5（forgot/vague/remembered/proficient/fluent） |
| 训练页 | 3（listening/spelling/review） |
| 训练题量 | 各 10/10/5 题 |
| 训练源 | 830 ready × level 1-4 |
| 错题回炉源 | 最近 100 条 quality=forgot 去重 |
| Levenshtein 阈值 | 1 字符（仅 ≥6 字符长词） |
| 持久化频率 | 每次答题立即写 |

---

## 4. 文件变更

### 新增
```
miniprogram/utils/srs.js                  ⭐ 间隔复习算法 (2.7KB)
miniprogram/utils/trainer.js              ⭐ 训练任务生成 (3.3KB)
miniprogram/pages/listening/             ⭐ 听音辨词 (4 个文件)
miniprogram/pages/spelling/              ⭐ 拼写检测 (4 个文件)
miniprogram/pages/review/                ⭐ 错题回炉 (4 个文件)
```

### 修改
```
miniprogram/utils/user-data.js           ✏️ wordProgress v2 schema + trainingLog
miniprogram/pages/today/today.{js,wxml,wxss}   ✏️ 加 3 个训练入口按钮
miniprogram/pages/mine/mine.{js,wxml,wxss}     ✏️ 5 维度统计 + 重置按钮
```

### 文件数变化
- 阶段二：34 源文件 + 8 PNG = 42
- 阶段三：45 源文件 + 8 PNG = 53 (+11)

---

## 5. 验收清单

### 5.1 静态校验（已完成）
- ✅ 15 个 .js 通过 `node --check`（含 4 个 utils + 8 个 pages + app.js + words-core.js）
- ✅ 3 个新 page .json 通过 parse
- ✅ 5 个 page WXML 配平（view/text/button/input 全部对齐）
- ✅ `naturalListen` 字段在 schema 中（阶段四填）

### 5.2 真机/IDE 验收（需要 user）
1. **启动 v2** → 热重载应自动应用
2. **今日页** → 在"今日 10 词"和"设置"中间出现「今日训练」按钮组（3 个）
3. **点击 🎧 听音辨词** → 进入 listening 训练页
   - 10 题 / 4 选 1 / 播 audio
   - 提交后：✅ / ❌ 反馈 + 正确词 + 释义
4. **点击 ✏️ 拼写检测** → 进入 spelling
   - 10 题 / 显示释义+IPA → user 输入
   - 大小写不敏感；长词 1 typo 算 vague
5. **点击 🔁 错题回炉** → 进入 review
   - 没有错题：显示"还没有错题"
   - 有错题：5 题一组 / 走 listening 流程
6. **"我的"页** → 5 维度统计（认识/标准听力/拼写/会说/自然口语）+ 已掌握 + 训练次数
7. **持久化测试**：训练 5 题 → 杀进程 → 重新进 → 进度保留

### 5.3 红线执行
- ✅ 仅用 830 ready 词训练（不依赖 2170 missing）
- ✅ 训练源无 0 假占位 / 0 错 URL
- ✅ 持久化每次答题后（不丢数据）
- ✅ 没动 VPS 音频库
- ✅ 没进阶段四 / 阶段五

---

## 6. 阶段四衔接（下一阶段）

阶段三训练池锁定 830 ready 词。**阶段四 = TTS 补 2170 + 自然口语解码**。

**第一阶段（必须先做）**：
1. **edge-tts 补 2170 missing** — `en-US-JennyNeural --rate=0%`（自然美式）+ `--rate=-25%`（慢速） + `--rate=+10%`（快自然）
2. 上传到 `english.wujiong.cn/audio/`
3. 重跑 audit-vps 验证 100% 命中
4. **更新 words-core.json + words-core.js**（2170 改 status=ready）
5. trainer 自动扩到 3000

**第二阶段（自然口语专项）**：
1. 写 `data/pronunciation-patterns.json`（弱读/连读/吞音/闪音规则 100+）
2. 写 `data/sentences.json`（重点口语句 500 句）
3. TTS 批量生成三档（segmented / clear / natural）
4. 新建 `pages/natural/` 训练页（听自然语速猜原句 / 跟读模仿）

**前置条件**：
- 阶段三跑通（user 验收）
- 2170 音频补量完成

---

## 7. 自我硬规执行

| 规则 | 状态 |
|---|---|
| 写 .js 立即 `node --check` | ✅ 15 个文件全过 |
| WXML 标签配平 | ✅ 5 个 page 全过 |
| .json parse | ✅ 3 个新 page.json |
| 不依赖 2170 missing | ✅ trainer.getReadyWords 强 filter |
| 持久化每次答题 | ✅ wordProgress + trainingLog 即时写 |
| 5 维度 schema 前向兼容 | ✅ naturalListen 字段已留（阶段四填） |
| 凭据不 dump | ✅ 无 |
| ECDICT 署名 | ✅ data/words-core.json.meta.attribution |

---

**阶段三 MVP 交付完毕。push GitHub 后续 + 等 user 真机验收。**
