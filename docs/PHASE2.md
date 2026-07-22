# Vocora — 阶段二交付报告

> 交付日期：2026-07-16
> build tag: `phase2-data-layer-2026-07-16`
> 上一阶段：[PHASE1.5.md](PHASE1.5.md)

---

## 1. 阶段二定位

按 [PROJECT-OUTLINE.md](PROJECT-OUTLINE.md) 阶段二："**内容数据层重建** — 预计 6~10 个有效开发日"。

**本轮（一次连续 session）交付**：
- ✅ 接入 ECDICT 词库（CC-BY-SA 4.0, 770K 词条）
- ✅ 选核心 3000 词（按 BNC 真实词频）
- ✅ 完整 Word schema（id/word/ipa/pos/meaning/frequency/level/collins/oxford/tag/exchange/audio）
- ✅ 关联 830 个真实音频（2170 missing 不假占位）
- ✅ `utils/data-repository.js` 统一数据访问层
- ✅ 扩展今日页：词列表 + 左右切词 + 形变显示
- ✅ 工具链：`tools/build-data-js.mjs`（JSON → require 形式）

---

## 2. 关键数字

| 指标 | 数值 |
|---|---|
| **ECDICT 词库源** | 770,611 词条 (28.3% 有 IPA, 99.8% 有翻译) |
| **BNC 词频表 (lemma.en.txt)** | 62,008 词（按 BNC corpus 真实频次排） |
| **核心 3000 词入选率** | 100% (全部有中文翻译) |
| **有 IPA 比例** | 99.4% (2983/3000) |
| **Collins 1+ 词** | 91.9% (2759/3000) |
| **音频匹配 (ready)** | **830** (27.7%) — 标准美式音 |
| **音频缺失 (missing)** | **2170** (72.3%) — 阶段四 edge-tts 补 |
| **音频 spell (拼读)** | 0 — 跟 BNC top 3000 错位 |
| **音频 chinese (中文)** | 0 — 跟 BNC top 3000 错位 |
| **缺失主要词** | well/now/over/one/down/much/want/thing/tell/child... (高频功能词) |

**严格按红线**：
- ❌ 2170 missing **不生成**假占位文件
- ✅ Page 显示"音频缺失"按钮禁用
- ✅ 830 ready 直接走 CDN

---

## 3. 数据 schema 完整定义

```json
{
  "id": "w-0001",                    // 内部 ID
  "word": "be",                      // 词
  "ipa": "bi:",                      // 标准音标 (ECDICT)
  "pos": "v",                        // 词性 (从 translation 提取)
  "meaning": "是, 表示, 在",         // 中文释义
  "frequency": 4109826,              // BNC 词频
  "level": 1,                        // 派生分级 (1=超高频, 6=低频)
  "collins": 5,                      // Collins 星级 0-5
  "oxford": 1,                       // Oxford 星级 0-3
  "tag": "zk gk",                    // 考试标签 (zk=中考 gk=高考 cet4 cet6 ielts toefl gre)
  "exchange": {                      // 词形变化
    "p": "was",                      // 过去式
    "d": "been",                     // 过去分词
    "i": "being",                    // 现在分词
    "3": "is"                        // 第三人称单数
  },
  "audio": {
    "status": "ready",               // 'ready' | 'ready_spell' | 'ready_chinese' | 'missing'
    "url": "https://english.wujiong.cn/audio/be.mp3",
    "kind": "standard"               // 'standard' | 'spell' | 'chinese'
  }
}
```

**音频 kind 说明**（按 audio/ 目录命名规律分类）：
- `standard` — 单词标准美式发音 (xxx.mp3)
- `spell` — 拼读音频 (spell_xxx.mp3, ~25KB, 慢速逐字母)
- `chinese` — 中文发音 (cn_xxx.mp3, ~9KB, 中文 TTS)

> **重要发现**：spell / chinese 命名是原 PWA 项目的扩展词表，**不与 BNC top 3000 重叠**。所以 2170 missing 暂时没有 chinese 兜底。
> 阶段四 TTS 补量时，会**直接生成 standard** 优先（按 user 大纲"标准美式发音"）。

---

## 4. 词频分级标准 (level 1-6)

按 BNC 词频自动分级：

| Level | BNC 频率范围 | 含义 | 词数 |
|---|---|---|---|
| 1 | ≥ 500,000 | 超高频 | 11 |
| 2 | ≥ 50,000 | 高频 | 96 |
| 3 | ≥ 10,000 | 常用 | 730 |
| 4 | ≥ 3,000 | 中频 | 1,398 |
| 5 | ≥ 1,000 | 中低频 | 765 |
| 6 | < 1,000 | 低频 (理论上, 当前 3000 词不包含) | 0 |

---

## 5. 数据访问层 API

`utils/data-repository.js` 暴露：

```js
const repo = require('./data-repository.js');

// Meta
repo.getMeta()                       // { version, source, license, ... }
repo.getAudioStats()                 // { total, ready, readySpell, readyChinese, missing }

// 查询
repo.getAllWords()                   // 全部 3000 词
repo.getWordById('w-0001')           // 按 id
repo.getWordByText('apple')          // 按 text
repo.getWordsByLevel(1)              // 按 level
repo.getWordsByFrequency(100000)     // 按 BNC 词频
repo.searchWords('app', 20)          // 前缀/包含搜索

// 今日训练 (MVP 简化版)
repo.getTodayBatch({
  size: 10,                         // 词数
  preferLevels: [1, 2, 3],          // 优先级别
  learnedIds: ['w-0001', ...],      // 已学（阶段三接 user progress）
  reviewCount: 0,                   // 复习数
})
// → { date, size, review, fresh, words }
```

---

## 6. 阶段二新增文件

```
D:\english-bolt-miniapp\
├── data/
│   └── words-core.json              ⭐ 895KB, 3000 词 (源数据)
├── tools/
│   ├── _ecdict-build.py             ⭐ VPS 端 ECDICT build 脚本
│   ├── _ecdict-analyze.py           ⭐ ECDICT 分析探针
│   ├── _ecdict-debug.py             ⭐ missing 探针
│   ├── _ecdict-debug2.py            ⭐ top 50 探针
│   └── build-data-js.mjs            ⭐ JSON → require .js 编译器
└── miniprogram/
    ├── data/
    │   └── words-core.js            ⭐ 895KB, 微信可 require 形式
    ├── utils/
    │   ├── data-repository.js       ⭐ 统一数据访问层
    │   └── audio-cdn.js             ✏️ 改造用 data-repository
    └── pages/today/
        ├── today.js                 ✏️ 拉今日 10 词 + 切词
        ├── today.wxml               ✏️ 词列表 + 形变 + 元信息
        └── today.wxss               ✏️ 词卡 + 药丸 (pill) 样式
```

**修改的原有文件**（v2 大纲字段扩展）：
- `utils/audio-cdn.js` — 接入 data-repository
- `pages/today/today.{js,wxml,wxss}` — 多词 + 切词

---

## 7. 关键设计决策

### 7.1 词库选 ECDICT 不用其他
- ✅ CC-BY-SA 4.0 license（商业可用 + 需署名）
- ✅ 词条全（770K）
- ✅ 含 IPA（28.3%）
- ✅ 含 BNC 词频（lemma.en.txt 配套）
- ✅ 含 Collins/Oxford 星级 + 考试标签
- ✅ 数据从公开 BNC corpus 派生，**准确**
- ❌ 不依赖网络（一次性下载到本机）
- 替代候选：GMAT/GRE 8000 词表（量小但不准），欧路词库（商业）

### 7.2 数据打包进主包（inline require）
- 当前 895KB 词表全量 inline 进 `miniprogram/data/words-core.js`
- 微信开发者工具会自动 gzip（实际传输 ~300KB）
- 阶段三优化：按 level 分包（1-2 核心 + 3-4 常用 + 5-6 扩展 → subpackages）
- 阶段三也可以：本地存 JSON + 启动异步读（避开主包）

### 7.3 audio 不补 TTS（推迟到阶段四）
- 2170 missing 集中在 BNC top 3000 高频功能词
- 阶段二用 edge-tts 补量会**推迟阶段三**（每日训练引擎）
- 阶段四 TTS 专项**同时**补 standard 音频 + 弱读/连读/吞音 → 一次跑完
- 严格按 user 红线：missing 标 missing，**绝不**生成空 mp3

### 7.4 形变 exchange 字段
- ECDICT 原生提供 (p/d/i/3)
- v2 不在此字段做"自然口语"标注（那是阶段四的 pronunciation pattern）
- v2 今日页直接显示"过去式 was"等，给用户"认识"层

---

## 8. 验收清单

### 8.1 静态校验（已完成，输出归档）
- ✅ 6 个 .js 通过 `node --check`（新 + 改）
- ✅ 1 个 .mjs 通过 `node --check`
- ✅ 3000 词 100% 有 translation
- ✅ 2983 词有 IPA (99.4%)
- ✅ 2759 词 collins 1+ (91.9%)
- ✅ WXML 标签配平 (view/text/button 全部成对)
- ✅ words-core.js 895KB (原始 JSON 841KB, +6.4% header)

### 8.2 微信开发者工具验收（需要 user）
> 装好后导入 `D:\english-bolt-miniapp`，跑今日页：
1. 看到 10 个 BNC top 词（be/have/it/he/i/they/you/not/she/do）
2. 词卡显示 IPA + 释义 + Collins 星级 + 形变
3. 点"播放"听到 be/have/it 等真音频
4. 词列表里 well/now/over 等显示"—"（missing）
5. 点 missing 词 → 按钮变"音频缺失"
6. 左右切词流畅，tts 状态不残留
7. 顶部 meta-bar 显示 3000 / 830 ready / 2170 missing

### 8.3 真机预览验收
- 同上，重点是：**2170 missing 在真机上仍然 missing**（CDN 真实缺，不是网络问题）
- 830 ready 在真机正常播放

---

## 9. 阶段三衔接（下一阶段）

按 v2 大纲：阶段三是"每日主动学习引擎"（6~10 有效开发日）。

**下一轮交付**：
1. 引入 `user-data.js` 的 `wordProgress` 真实记录
2. 间隔复习算法：当天/1天/3天/7天/21天
3. 听音辨词训练：audio 优先 + 中文提示
4. 中文说英文：translation 翻 audio
5. 跟读模仿：录音 + 回放（阶段四 TTS 配套）

**前置依赖**：
- 2170 missing 词音频可补（阶段四专项）
- 词组分包（5000 词组）+ 重点口语句（500 句 × 3 档）— 也可放到阶段四一起做

---

## 10. 自我硬规执行

| 规则 | 状态 |
|---|---|
| 写 .js 立即 `node --check` | ✅ 6 个新 + 改 |
| 不假占位 | ✅ 2170 missing 标 missing，**未**生成任何 mp3 |
| 凭据不 dump | ✅ vault 只读 key，github token 走内存 |
| ECDICT 署名 | ✅ `data/words-core.json.meta.attribution` 字段，README 也加 |
| 中文 IPC 内容 | ✅ 全部用 user 语言 |

---

**阶段二交付完毕。等 user 装好开发者工具跑通后，进入阶段三。**
