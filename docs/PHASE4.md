# 阶段四 — 自然口语解码 (Natural Speech Decoding)

> 训练英语耳朵识别"自然美式口语"中的音变 ——
> 弱读、连读、同化、吞音、闪音、重音、节奏、非正式压缩。
> 这是英语快充 v2 唯一能"听 + 跟读"真实自然语速音频的阶段。

---

## 子阶段划分 (按 user 2026-07-17 决策)

阶段四拆为 **A (骨架) + B (音频与训练)**,**B 启动前必须先 A 提交并获得 user 确认**。

### 阶段四 A — 内容与规则骨架 (本阶段交付)

**目标**:把 9 类自然口语规则的"教学素材"和"导航结构"建出来,但**不假装训练可用**。

| # | 交付物 | 状态 |
|---|--------|------|
| 1 | 9 类自然口语规则库 (弱读/缩写/连读/同化/吞音/闪音/重音/节奏/非正式) | ✅ |
| 2 | 每类 20 条高质量重点句,共 **180 条** | ✅ |
| 3 | 每条带完整 11 字段 (writtenText/translation/clearText/naturalText/standardIpa/naturalIpa/stressWords/speechChunks/pronunciationNotes/audioClear/audioNatural) | ✅ |
| 4 | 音频字段 `status: "pending"`,不伪装可播放 | ✅ |
| 5 | 数据访问层 `utils/natural-data.js` (getLessonList / getLesson / getSentence / getAudioStatusSummary) | ✅ |
| 6 | 课程首页 `pages/natural/index` (9 课卡片 + 总览) | ✅ |
| 7 | 通用 lesson 详情页 `pages/natural/lesson?id=...` (20 句内容 + 规则 + 小贴士) | ✅ |
| 8 | 5th tab "自然" + 配套 tab 图标 | ✅ |
| 9 | app.json 注册 2 个新页面 + tabBar 5 项 | ✅ |
| 10 | app.js buildTag 升级为 `phase4a-skeleton-2026-07-17` | ✅ |
| ❌ | **不做**: 训练模式页面 (train.js)、任何"听写"按钮、"对比播放"按钮 | by design |

**阶段四 A 的核心承诺**:
- 任何 audio 字段为 pending 时,UI 显式标"⏳ 音频 pending",**绝不**给假播放按钮
- 用户点开任何课程,看到的是"内容骨架"——可以读 IPA、读变化点、读重音/意群,但不能播放、不能训练
- 这是**主动的克制**,不是"做不出来就降级"

### 阶段四 B — 真实音频与训练闭环 (待 user 确认 180 条后启动)

**前置条件**(必须全部满足):
1. ✅ User 审过 180 条内容 (措辞、IPA、变化点) 并通过
2. ⏳ 选定 180 条的自然美式 TTS 服务 (OpenAI TTS-1 / ElevenLabs / Edge TTS / 自录)
3. ⏳ 选定 180 条的清晰慢速 TTS 服务 (同上,可不同)
4. ⏳ 部署音频到 CDN (暂定 `https://english.wujiong.cn/audio/natural/`)
5. ⏳ 逐条 HTTP 200 校验,记录 size/duration
6. ⏳ 自然语速不能是"机械加速",必须由 TTS 引擎真正生成有弱读/连读/同化效果的版本

**B 阶段交付物**(共 5 个训练模式):
1. **听自然语速猜原句** — 4 选 1,训练耳朵对自然音变的辨识
2. **声音切词** — 播放自然版,写/选出原句拆分
3. **慢速/自然切换** — 同一句两版对照,标出"自然版被吃掉"的位置
4. **标注变化** — 看原句,标出哪里被弱读/连读/吞音/闪音
5. **跟读录音与回放** — 跟读自然版,录音后回放自评(不接付费评分)

**B 阶段音频部署规范**:
- 文件命名: `clear-{lessonId}-{NNN}.mp3` (慢速版), `natural-{lessonId}-{NNN}.mp3` (自然版)
- 180 × 2 = **360 个 mp3 文件**
- 每条 url 必填入 sentence.audioClear.url / audioNatural.url,status 改为 `"ready"`
- size/duration 在部署后从 HTTP HEAD 响应回填

**B 阶段不做的**:
- ❌ 付费评分 (跟读用 wx.startRecord + 自评即可,不对接 ASR/AI 评分)
- ❌ 2170 个单词音频补量 (阶段四 B 仍以 180 句为训练源,单词音频留给后续阶段)
- ❌ 重点句的扩量 (180 条审核通过后再说,质量优先)

---

## 关键决策与拒绝项

### 拒绝项 — 阶段四绝不降级为"静态展示 + 演示版训练"

**user 原话 (2026-07-17)**:
> "停止把阶段四降级为'静态展示 + 演示版训练'。自然口语解码没有真实自然语速音频,就不能宣称训练模式完成。"

**翻译成具体行为**:
- 不做"IPA 对比卡片"当成训练模式
- 不做"慢速版 vs 自然版文字对比"当成训练模式
- 不做"听写"功能用 830 ready 单词的现有 mp3 代替
- 不在 A 阶段就放出"开始训练"按钮,即使前端可以"假"做

### 决策 1 — 重点句不以 830 ready 词为限

**原方案**: 用 830 ready 词的 mp3 作为训练音频,把重点句约束在 830 内可拼句的范围。
**新方案 (user 决策)**: 重点句以"真实高频自然表达"为质量优先,不限于 830 ready 词。
**后果**: 180 条句子的 mp3 **必须新生成**,不能用现有 830 mp3 拼接。

### 决策 2 — 1 个通用 lesson 页面 + id 参数

**原方案**: 9 类课程 = 9 个独立 lesson 页面
**新方案**: 1 个 `pages/natural/lesson.js`,通过 `?id=weak-form` 等参数动态加载。
**好处**: 新增一类只需改 JSON + 加 nav,不改页面代码。

### 决策 3 — 通用 train 页面留到 B 阶段

**原方案**: 阶段四直接做 train.js 含 4-5 个模式
**新方案**: 阶段四 A 只做内容浏览。train.js 留到 B 阶段,且 5 个模式全做完才上线。
**好处**: 不出现"半成品训练模式"。

### 决策 4 — 课程首页放 tabBar 第 3 位

**布局**: 今日 · 沉浸 · **自然** · 场景 · 我的 (5 个)
**理由**: 自然口语是英语学习的核心能力,不能藏在二级入口。但要尊重 tabBar ≤ 5 的限制。

---

## 数据结构 (sentence schema)

```jsonc
{
  "id": "wf-01",                            // 唯一 id: lessonId + 序号
  "writtenText": "I can help you",          // 标准书面原句
  "translation": "我可以帮你",               // 中文翻译
  "clearText": "I can help you",            // 慢速清晰版
  "naturalText": "I c'n help ya",           // 自然美式口语版
  "standardIpa": "/aɪ kæn hɛlp juː/",       // 标准 IPA
  "naturalIpa": "/aɪ kən hɛlp jə/",         // 自然语速 IPA
  "stressWords": ["help"],                  // 句子重音词
  "speechChunks": ["I can", "help you"],    // 意群/词组切分
  "pronunciationNotes": [                   // 中文变化点说明
    "can → kən (弱读)",
    "you → jə (弱读)"
  ],
  "audioClear": {                            // 慢速版音频 (B 阶段回填)
    "status": "pending",                     // pending|ready|missing
    "url": null,
    "duration": null,
    "size": null
  },
  "audioNatural": { ...同上 },                // 自然版音频
  "audioSegmented": null                     // 可选: 按意群切分的音频
}
```

---

## 文件清单 (本阶段改动/新增)

### 新增
- `data/natural-sentences.json` (125 KB,180 条 × 11 字段)
- `miniprogram/data/natural-sentences.js` (89 KB,inline require 包装)
- `miniprogram/utils/natural-data.js` (数据访问层)
- `miniprogram/pages/natural/index.{js,wxml,wxss,json}` (课程首页)
- `miniprogram/pages/natural/lesson.{js,wxml,wxss,json}` (通用 lesson 详情)
- `miniprogram/assets/tab/natural-{inactive,active}.png` (声波图标)
- `docs/PHASE4.md` (本文)

### 修改
- `miniprogram/app.json` (注册 2 个新页 + tabBar 5 项)
- `miniprogram/app.js` (buildTag → `phase4a-skeleton-2026-07-17`)
- `tools/gen-icons.mjs` (新增 natural 图标)

### 暂未生成 (B 阶段)
- `miniprogram/pages/natural/train.{js,wxml,wxss,json}` (5 个训练模式)
- `miniprogram/data/natural-trainers.js` (训练题生成器)
- `data/natural-audio-audit.json` (360 个 mp3 部署状态)

---

## 验收清单 (A 阶段)

- [x] 9 类规则库元信息 (id/name/icon/subtitle/rule/tip) 完整
- [x] 180 条重点句 (9 × 20),每条 11 字段无空值
- [x] 全部 audioClear/audioNatural.status === 'pending',url 为 null
- [x] `node --check` 全部新 .js 通过
- [x] WXML 配平 (open=close) 全部新页通过
- [x] PNG 签名 89504E47 验证 2 个新 tab 图标
- [x] 数据访问层 getAudioStatusSummary 返回 {total:180, audioReady:0, audioPending:180}
- [x] 课程首页 + lesson 详情页可正常 navigate,不报错
- [x] 课程首页明确显示"⏳ 待音频 0/180 (0%)" + 阶段四 A 状态说明
- [x] lesson 详情页每条句子上有"⏳ 音频 pending"徽章,**无任何播放按钮**
- [x] **未**创建 train.js / 训练模式入口(留 B 阶段)

---

## 阶段四 B — 音频样板验收 (2026-07-17 user 启动)

### B 阶段硬规则 (user 2026-07-17 决策)

1. ❌ **禁止直接批量生成 360 条音频**, 必须先做"音频样板验收"
2. ✅ 只生成 12 条样板 (6 类各 2 条, 24 个 mp3)
3. ✅ 音频生成服务**不得写死**, 必须建统一 provider 抽象层
4. ✅ 实际成本不能用估算, 必须按 180 条真实字符数 + 官方定价 + 重试量重算
5. ✅ 12 条样板经人工验收前, **不**生成剩余 336 条

### B 阶段交付清单

| # | 交付物 | 状态 |
|---|--------|------|
| 1 | 180 条机械审计报告 (`docs/AUDIT-natural-sentences.md`) | ✅ 真异常=0, 30 条音节层教学标注为设计需要 |
| 2 | 可替换 TTS 适配层 (`tools/natural-tts-provider.mjs`) | ✅ 13 字段元数据固定顺序, provider 可换 |
| 3 | 12 条样板选择 (`data/natural-samples-12.json`) | ✅ 6 类各 2, 24 个 mp3 |
| 4 | 12 条 clear + natural 音频 | ✅ 24/24 成功 |
| 5 | 音频元数据 (24 份 per-file `*.meta.json` + 1 份汇总) | ✅ |
| 6 | 部署到 VPS (`scp` → `/var/www/english-trainer/audio/natural/`) | ✅ |
| 7 | HTTP 200 校验 (`tools/check-natural-audio.mjs`) | ✅ 24/24 通过 |
| 8 | 12 条 audio 字段回填 (`tools/backfill-natural-audio.mjs`) | ✅ 12 ready, 168 pending |
| 9 | 内部样板验收页 (`pages/natural/sample-review.{js,wxml,wxss,json}`) | ✅ 12 卡片, 4 状态 |
| 10 | 实际成本报告 (`docs/AUDIO-COST-12.md`) | ✅ 重算, 不复用旧估 |

### 12 条样板选择

| # | 课程 | 句 id | 类别 | 验证的变化 |
|---|---|---|---|---|
| 1 | weak-form | wf-01 | 弱读 | can → c'n, you → ya |
| 2 | weak-form | wf-08 | 弱读 | have to → hafta |
| 3 | linking | lk-01 | 连读 | turn+it+on 跨词连读 |
| 4 | linking | lk-04 | 连读 | an+apple n 跨词 |
| 5 | elision | el-01 | 吞音 | next 中 t 在 k/d 间消失 |
| 6 | elision | el-08 | 吞音 | don't 中 t 不爆破 |
| 7 | flap | fl-01 | 闪音 | water t 闪音化 (单词级) |
| 8 | flap | fl-04 | 闪音 | get it t 闪音化 (词组级) |
| 9 | assimilation | as-01 | 同化 | did+you → didja |
| 10 | assimilation | as-09 | 同化 | meet+you → meetcha |
| 11 | stress | st-01 | 句子重音 | want, go 重音 |
| 12 | rhythm | rh-01 | 节奏与意群 | need, talk, about 三重音 |

### TTS 适配层 (provider 可替换)

```
TTSProvider (abstract)
├── MiniMaxTTSProvider       (当前用, 走 MiniMax MCP batch_synthesize_speech)
│   - voice: English_Trustworthy_Man (clear) / English_Diligent_Man (natural)
│   - speed: 0.85 (clear) / 1.05 (natural)
│   - emotion: neutral
│   - model: speech-2.8-turbo (or hd, 实际走哪个未确认)
│
└── OpenAITTSProvider        (占位, 需 vault 配 OPENAI_API_KEY)
    - 切换 provider 只需改 buildMeta 的 provider 字段, 数据 + 页面无影响
```

**已知限制 (MiniMax TTS)**:
- ❌ 不支持 IPA 输入, "自然语速" 只能靠 naturalText 的拼写压缩 (didja/wanna/lemme) + speed 调整
- ❌ 不支持 instructions 驱动, "shoulda" 听起来不一定像真 shoulda
- ✅ 支持多语种 / 多 voice, 6 个英文 voice 可选
- ✅ 成本极低 (12 条仅 ¥0.05-0.10)

### 实际成本 (12 条实测)

| 模型 | 单价 | 12 条总成本 | 180 条外推 |
|---|---|---|---|
| speech-2.8-turbo | 2 元/万字符 | ¥0.0544 | ¥0.82 |
| speech-2.8-hd | 3.5 元/万字符 | ¥0.0952 | ¥1.43 |

- 字符数: 12 条 272 字符 (clear 142 + natural 130)
- 重试: 0 次 (24/24 一次成功)
- 旧估 (PHASE4.md) "$0.32" 对应 OpenAI TTS-1, **与 MiniMax 不可比**, 已废弃

### 内部验收页 (sample-review)

- 路由: `/pages/natural/sample-review` (从自然首页底部 "🔧 内部验收" 链接进入)
- 12 卡片, 每条:
  - 显示原文/自然/变化
  - ▶ 慢速 / ▶ 自然 / ⇄ 切换 三个播放按钮
  - ✅ 通过 / 🔄 需重做 / ⏳ 待审 三状态
  - 备注 textarea
- 数据存 `wx.storage` key `natural-samples-review-v1`
- 一键导出 JSON (剪贴板)

### B 阶段停止点 (user 指令)

完成下列后**不**继续批量生产, 等 user 人工验收样板音频:

- [x] 180 条数据机械审计报告
- [x] 12 条 clear + 12 条 natural 音频 (24 个 mp3, 24/24 HTTP 200)
- [x] 24 份音频元数据
- [x] 内部样板验收页
- [x] 实际成本报告 (不重用旧估)

**等 user 验收样板声音后, 再确定**:
- 最终 voice (English_Trustworthy_Man / Diligent_Man / 换人声)
- 最终 provider (MiniMax / OpenAI / ElevenLabs)
- 剩余 336 条的批量生产方案 (单批 size / 重试策略 / 部署流水线)
- audioSegmented 是否需要生成

**B 阶段不做的**:
- ❌ 训练模式页面 (留到 B 阶段全部音频就绪后)
- ❌ 跟读录音 (留到 B 阶段)
- ❌ 任何把 12 条当成"完整训练"对外开放的改动

---

**buildTag**: `phase4a-skeleton-2026-07-17` (A 已确认) + `phase4b-samples-12-2026-07-17` (B 进行中)
**stage**: B 阶段 12 条样板已就绪, 等 user 人工验收
**next gate**: user 验收 12 条样板音频 (听 + 给 pass/redo/notes)
**status**: ⏸  B 阶段 12 条样板完成, **停止等待人工验收**

---

## 给 user 的问题 (启动 B 阶段前需澄清)

1. **180 条内容** — 措辞、IPA、变化点是否需要调整? 哪几类需要补充更多例子?
2. **自然美式 TTS** — OpenAI TTS-1 / ElevenLabs / Edge TTS / Azure / 真人录制?
   - 推荐: OpenAI TTS-1 (性价比,自然度高),约 $15/百万字符
   - 180 句平均 30 字符 = 5400 字符 × 2 (清晰+自然) = $0.32 总成本
3. **清晰慢速 TTS** — 用同一个服务 + speed=0.8,还是另一个服务?
4. **CDN 部署** — 是否复用 `https://english.wujiong.cn/audio/natural/` 路径?
5. **训练模式 5 选 5 一次发,还是分批上线**? 建议一次发。

---

**buildTag**: `phase4a-skeleton-2026-07-17`
**stage**: A (内容与规则骨架,无音频)
**next gate**: 180 条内容经 user 审核通过
**status**: ✅ A 阶段完成,等待 user 评审
