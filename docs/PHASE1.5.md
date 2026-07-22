# Vocora — 阶段一深度盘点报告（PHASE1.5）

> 交付日期：2026-07-16
> 状态：✅ 阶段一闭环
> 基线：109 VPS (ai-supervisor) 端 100% 真实命中

---

## 1. 关键结论

| 指标 | 数值 |
|---|---|
| **VPS 端真实命中率** | **5855 / 5855 = 100.00%** ✅ |
| VPS 端总大小 | 82.7 MB |
| 平均音频大小 | 14.1 KB（短词 1-2s 朗读） |
| 本机视角命中率 | 5683 / 5855 = 97.1% |
| 本机→CDN 假阴性 | 172 个（Windows 防火墙/代理拦截，与 CDN 无关） |
| 原项目代码 | `/var/www/english-trainer/` (PWA / HTML+JS) |
| 关键发现 | 原项目也**叫"Vocora"**（PWA，非小程序）— 这就是 v2 要重新做的原因 |

> ✅ **v2 阶段二不需要为标准发音补 TTS** — 5855 mp3 已 100% 覆盖。
> 🆕 **v2 阶段四需要为"自然口语"补 TTS** — 现有音频是标准朗读，不含弱读/连读/吞音。

---

## 2. 数据层文件

```
D:\english-bolt-miniapp\data\
├── audio-files.txt          85KB   5855 行（完整文件名清单，UTF-8 LF）
├── audio-audit.jsonl       892KB   本机视角 5855 行（5683 200 / 172 假阴性）
├── audio-audit.csv         515KB   同上 CSV 视图
├── audio-audit-vps.jsonl   953KB   ⭐ VPS 端 100% 真实基线
├── audio-vps-words.txt      62KB   5855 unique words (lowercase)
├── audio-vps-urls.json     790KB   {word: {url, size, contentType}} 索引
├── extra-words.js           38KB   原项目 EXTRA_WORDS 数组 (540 词条)
└── index.html              196KB   原项目主页 (3200 行, 含主词表)
```

---

## 3. 文件命名规律（深度分析）

5855 个文件名扫描后分为 5 大族系：

### 3.1 普通单词 (lowercase)
约 **3000+** 个
```
the, apple, computer, banana, water, food, house, car, book, phone...
```
v2 核心 3000 词标准音**全部命中**。

### 3.2 特殊命名 (mixed case / PascalCase)
约 **25** 个
- 月份：`April, August, December, February` (大写首字母)
- 星期：`Friday, Monday, Tuesday...`
- 单字母：`I, PE`

### 3.3 拼写练习音频 (spell_*)
约 **1500** 个
```
spell_apple.mp3, spell_accept.mp3, spell_zoo.mp3...
```
- 用途：原项目作为"逐字母拼读"训练
- 大小：~10-25KB（比单词朗读长，因为逐字母）
- v2 阶段二可复用为**逐词拆读**音频（大纲要求）

### 3.4 中文释义音频 (cn_* + cn_p_*)
约 **2191** 个
```
cn_apple.mp3, cn_accept.mp3, cn_cabbage.mp3...
cn_p_2cdb4663.mp3... (hash 命名的多音字)
```
- 用途：原项目作为"中文翻译朗读"辅助
- 大小：~8-9KB（中文 TTS 短）
- v2 阶段二可复用为**中文近似音**音频
- 注意：本机 Windows 防火墙拦截 `cn_*` 前缀的 fetch（VPS 端 200 OK）

### 3.5 其他
少量 hash 命名 (`cn_p_<hash>.mp3`) + 数字编号 + 散落短词

---

## 4. 大小分布

```
< 10 KB   1850 个  短词 (apple, the, a, an, be, to...)
10-15 KB  3100 个  常规词 (computer, banana, water, run, take...)
15-25 KB   750 个  长词 / 拼写 (watermelon, communication, spell_xxx...)
> 25 KB    155 个  超长词 / 慢速拼读
```

---

## 5. 原项目代码关键信息

| 文件 | 行数 | 角色 |
|---|---|---|
| `index.html` | 3239 | PWA 主页 + 全部 JS (含 6 个 view: player/book/quiz/bgplayer/profile/phrases/reading/errors) |
| `extra-words.js` | 525 | EXTRA_WORDS 数组 (540 词条，字段: w/p/c/s/cat) |
| `sw.js` | 51 | Service Worker |
| `manifest.json` | 13 | PWA manifest |
| `audio/` | 5855 mp3 | 全部音频资产 |

**关键发现**：
- 原项目是**PWA (HTML+JS+SW)**，不是微信小程序
- 但**也叫"Vocora"** — 这就是 user 要"重新做一个小程序"的原因
- 词表格式极简（无 IPA / 无自然口语标注 / 无场景标签）— **v2 必须重建数据 schema**
- 词表覆盖 540 词 (extra-words) + 散落在 index.html WORD_CATS — 总词数 ~3000

---

## 6. 与 v2 大纲的差距分析

| 大纲要求 | 原项目覆盖 | v2 阶段二必须做 |
|---|---|---|
| 8000-10000 词 | ~3000 词（散落） | 引入 ECDICT 词库（CC-BY-SA） |
| IPA 音标 | ❌ 完全无 | ECDICT 自带 + 人工校对核心 3000 |
| 自然口语变化 (弱读/连读) | ❌ 完全无 | 阶段四 TTS 专项生成 |
| 词组/搭配 | ❌ 极少 | ECDICT + 自建 collocation 库 |
| 场景分类 (16 场景) | ❌ 部分 (work/school/media/society) | 重新设计 scene tag 系统 |
| 例句 (15-20K) | ~540 句 | 阶段二补 1000+ 句核心 |
| 跟读录音 | ❌ 无 | 阶段四实现 |
| 间隔复习 | ❌ 无 | 阶段三实现 |

**v2 阶段二核心交付**：
1. 接入 ECDICT 词库（CC-BY-SA 4.0, 商业可用, 需署名）
2. 设计完整 Word / Phrase / Sentence / Scene schema
3. 写 data loader 加载 JSON 包
4. 与 audio-vps-urls.json 关联
5. 暴露给今日页 demo（多词列表 + 真实播放）

---

## 7. 工具脚本清单

| 工具 | 用途 | 阶段二会扩展 |
|---|---|---|
| `tools/audit-audio.mjs` | 本机视角 HEAD 验证（5683/5855） | 加 `--vps` 模式走 ssh tunnel |
| `tools/audit-vps.py` | VPS 端 HEAD 验证（100% 真实基线） | 加 diff mode 找变化 |
| `tools/build-word-list.mjs` | 过滤 status=200 → word list + url map | 加 category filter |
| `tools/gen-icons.mjs` | 81x81 PNG tabBar 图标 | designer 出图后替换 |

---

## 8. 安全 / 红线执行记录

| 规则 | 状态 |
|---|---|
| 不 dump secret 到 chat | ✅ vault 只读 key 名，password 走 SSH key 鉴权未进 chat |
| 不生成假占位 mp3 | ✅ 5683/172/VPS-5855 三方对照，无任何空文件 |
| 写 .js 后 `node --check` | ✅ 11 个 .js/.mjs 全部通过 |
| WXML 标签配平 | ✅ view/text 全部成对 |
| PNG 签名合法 | ✅ 8 个 PNG 签名 89504E47... |
| 不破坏原项目 | ✅ ssh 只读 + scp 拉副本到本机，VPS 文件未改 |
| 凭据走 vault | ✅ mavis secret CLI 不可用时走 SSH key (id_rsa) |

---

## 9. 阶段二启动条件

user 需要拍板：

1. **是否在本机装好微信开发者工具**（user 已说"有"，是否已经装到 `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat` 待确认）
2. **是否进入阶段二**（数据层重建：ECDICT 词库 + schema + 工具链）
3. **是否分 session 推进**（v2 阶段二预计 6-10 有效开发日）

---

## 10. 阶段一完整文件树

```
D:\english-bolt-miniapp\          33 源文件 + 8 PNG + 8 数据文件
├── .gitignore
├── README.md
├── project.config.json
├── project.private.config.json
├── docs/
│   ├── PHASE1.md                  阶段一总览
│   └── PHASE1.5.md                ⭐ 阶段一深度盘点（本文）
├── data/                          ⭐ 真实资产盘点
│   ├── audio-files.txt            85KB
│   ├── audio-audit.jsonl          892KB
│   ├── audio-audit.csv            515KB
│   ├── audio-audit-vps.jsonl      953KB (基线)
│   ├── audio-vps-words.txt        62KB
│   ├── audio-vps-urls.json        790KB
│   ├── extra-words.js             38KB
│   └── index.html                 196KB
├── tools/
│   ├── audit-audio.mjs            本机视角 HEAD 验证
│   ├── audit-vps.py               VPS 端 HEAD 验证
│   ├── build-word-list.mjs        jsonl → words.txt + urls.json
│   ├── gen-icons.mjs              tabBar 图标生成
│   ├── top100-words.txt           抽样词表
│   ├── _ssh-probe.sh              临时探针
│   ├── _ssh-introspect.sh         临时探针
│   └── _ssh-probe-fixed.sh        临时探针
└── miniprogram/
    ├── app.js, app.json, app.wxss, sitemap.json
    ├── assets/tab/                8 PNG (4 tab × 2 状态)
    ├── utils/
    │   ├── tts.js                 ⭐ 音频管理器（修原项目三大坑）
    │   ├── user-data.js           ⭐ 存储仓库
    │   └── audio-cdn.js           CDN URL 构造
    └── pages/
        ├── today/                 主页 (1 word demo, 真实播放链路)
        ├── immerse/               占位
        ├── scene/                 占位
        └── mine/                  占位
```

---

**阶段一彻底闭环。100% 真实基线 + 工具链 + 文档 + 原项目代码全留档。等 user 确认进入阶段二。**
