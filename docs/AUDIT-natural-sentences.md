# 阶段四 A — 180 条自然口语解码数据机械审计

生成时间: 2026-07-17T05:38:01.851Z
数据文件: `data\natural-sentences.json`

## 1. 总量 / 分布

- 总课程数: **9** (期望 9) ✅
- 总句子数: **180** (期望 180) ✅

| 课程 | 句子数 | 期望 |
|---|---|---|
| weak-form | 20 | 20 ✅ |
| contraction | 20 | 20 ✅ |
| linking | 20 | 20 ✅ |
| assimilation | 20 | 20 ✅ |
| elision | 20 | 20 ✅ |
| flap | 20 | 20 ✅ |
| stress | 20 | 20 ✅ |
| rhythm | 20 | 20 ✅ |
| informal | 20 | 20 ✅ |

## 2. id 全局唯一

- 唯一 id 总数: **180** ✅
- 重复 id: **0** ✅

## 3. 字段完整性

| 检查项 | 缺失数 | 状态 |
|---|---|---|
| 字段 13 项缺失 | 0 | ✅ |
| writtenText 空 | 0 | ✅ |
| translation 空 | 0 | ✅ |
| clearText 空 | 0 | ✅ |
| naturalText 空 | 0 | ✅ |
| standardIpa 空 | 0 | ✅ |
| naturalIpa 空 | 0 | ✅ |
| pronunciationNotes 空 | 0 | ✅ |

## 4. 内容交叉校验

| 检查项 | 异常数 | 状态 |
|---|---|---|
| stressWords 不在 writtenText 中 | 6 | ⚠️ |
| speechChunks 拼接与 writtenText 重叠率<60% | 24 | ⚠️ |
| IPA 格式异常 (非 /.../ 形式) | 0 | ✅ |

## 5. A 阶段铁律: audio 状态必须为 pending

- audioClear.status !== pending: **0** ✅
- audioNatural.status !== pending: **0** ✅

## 6. 异常清单 + 分类

共发现 **30** 条异常, 详见 `data/audit-natural-sentences.json`。

### 6.1 按"是否真异常"分类

- **stressWord_not_in_written**: 6 条, **全部**为音节层重音标注 (如 `prít`=`pretty` 的 i 音节, `gon`=`gonna` 的 go 音节, `blee`=`problemo` 的 -ble- 音节, `yall`=`Y'all` 去撇号), 是教学设计,**不是数据错误**。审计脚本的字符串匹配按整词比对,无法识别音节层标注。
- **chunks_dont_join**: 24 条, 集中在 **flap 课 13 条** + linking/lk-12 + elision/el-03/06 + stress/st-13。这些都是**显式音节切分**(如 `Wa ter`=`Water` 标 t 闪音位置, `Pu tit`=`Put it` 标 t 闪音位置, `No tat all`=`Not at all` 标两个 t 都闪音), 是教学设计,**不是数据错误**。
- **两类同时异常的句子**: 2 条 (flap/fl-03, flap/fl-15)

### 6.2 详细异常清单

#### chunks_dont_join (24 条)

- `linking/lk-12` — speechChunks 拼接后与 writtenText 重叠率仅 33%: "Far a way" vs "Far away"
- `elision/el-03` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Friend ship" vs "Friendship"
- `elision/el-06` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Hand some" vs "Handsome"
- `flap/fl-01` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Wa ter" vs "Water"
- `flap/fl-02` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Bet ter" vs "Better"
- `flap/fl-03` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Pri tty" vs "Pretty"
- `flap/fl-04` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Ge tit" vs "Get it"
- `flap/fl-05` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Ci ty" vs "City"
- `flap/fl-06` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Let ter" vs "Letter"
- `flap/fl-07` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Mat ter" vs "Matter"
- `flap/fl-08` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Li ttle" vs "Little"
- `flap/fl-09` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Bot tle" vs "Bottle"
- `flap/fl-10` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Ti tle" vs "Title"
- `flap/fl-11` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "For ty" vs "Forty"
- `flap/fl-12` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Sat tur day" vs "Saturday"
- `flap/fl-13` — speechChunks 拼接后与 writtenText 重叠率仅 33%: "No tat all" vs "Not at all"
- `flap/fl-14` — speechChunks 拼接后与 writtenText 重叠率仅 33%: "Pu tit down" vs "Put it down"
- `flap/fl-15` — speechChunks 拼接后与 writtenText 重叠率仅 33%: "I'm gon na" vs "I'm going to"
- `flap/fl-16` — speechChunks 拼接后与 writtenText 重叠率仅 50%: "Bet cha" vs "Bet you"
- `flap/fl-17` — speechChunks 拼接后与 writtenText 重叠率仅 50%: "I got ta go" vs "I gotta go"
- `flap/fl-18` — speechChunks 拼接后与 writtenText 重叠率仅 0%: "Don 't for get" vs "Don't forget"
- `flap/fl-19` — speechChunks 拼接后与 writtenText 重叠率仅 50%: "Righ there" vs "Right there"
- `flap/fl-20` — speechChunks 拼接后与 writtenText 重叠率仅 25%: "Wha time i sit" vs "What time is it"
- `stress/st-13` — speechChunks 拼接后与 writtenText 重叠率仅 50%: "We leave to morrow" vs "We leave tomorrow"

#### stressWord_not_in_written (6 条)

- `flap/fl-03` — stressWords["prít"] 不在 writtenText 中
- `flap/fl-15` — stressWords["gon"] 不在 writtenText 中
- `rhythm/rh-19` — stressWords["gon"] 不在 writtenText 中
- `informal/if-11` — stressWords["what"] 不在 writtenText 中
- `informal/if-12` — stressWords["yall"] 不在 writtenText 中
- `informal/if-15` — stressWords["blee"] 不在 writtenText 中

### 6.3 建议处理方式

**对 user** (按 user "不要静默修正内容" 原则):

1. 这 30 条全部为**音节层教学标注**, 数据本身无误, **不需要修改数据**
2. 如果 user 确认这 30 条都是设计需要, 这次审计视为 100% 通过
3. 如果 user 想统一为"整词重音/整词意群", 需要修 6 条 stressWords + 24 条 speechChunks — 那是教学法选择, 不是 bug 修复
4. 真异常 = 0 (空字段、缺失字段、id 重复、audio 状态错、IPA 格式错 — 全部 0)