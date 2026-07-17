#!/usr/bin/env node
/**
 * tools/calc-audio-cost.mjs
 *
 * 阶段四 B — 真实成本计算。
 *
 * 按 MiniMax 官方定价:
 *   - 同步语音合成 T2A speech-2.8-turbo:  2 元/万字符
 *   - 同步语音合成 T2A speech-2.8-hd:     3.5 元/万字符
 *   (来源: https://platform.minimaxi.com/docs/guides/pricing-paygo)
 *
 * 用本次 12 条样板的实际输入字符数计算, **不**用估算。
 *
 * 输出:
 *   - docs/AUDIO-COST-12.md  (人读)
 *   - data/natural-audio-cost-12.json (机读)
 *
 * 运行: node tools/calc-audio-cost.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SAMPLES_FILE = path.join(ROOT, 'data', 'natural-samples-12.json');
const REPORT_JSON = path.join(ROOT, 'data', 'natural-audio-cost-12.json');
const REPORT_MD = path.join(ROOT, 'docs', 'AUDIO-COST-12.md');

// 官方定价 (人民币)
const PRICING = {
  'speech-2.8-turbo': 2.0,     // 元/万字符
  'speech-2.8-hd':    3.5,     // 元/万字符
  'speech-02-turbo':  2.0,
  'speech-02-hd':     3.5,
  'speech-2.6-turbo': 2.0,
  'speech-2.6-hd':    3.5,
  'speech-01':        null,    // legacy, 已下线, 不列入
};

// 重试量 (本次实际: 0 失败, 0 重试)
const RETRY_COUNT = 0;

const samples = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8')).samples;

const items = [];
let totalChars = 0;
let totalCharsClear = 0;
let totalCharsNatural = 0;

for (const s of samples) {
  const cChars = s.clearText.length;
  const nChars = s.naturalText.length;
  totalCharsClear += cChars;
  totalCharsNatural += nChars;
  totalChars += cChars + nChars;
  items.push({
    sentenceId: s.sentenceId,
    category: s.category,
    clearText: s.clearText,
    clearChars: cChars,
    naturalText: s.naturalText,
    naturalChars: nChars,
    totalChars: cChars + nChars,
  });
}

const report = {
  computedAt: new Date().toISOString(),
  pricingSource: 'https://platform.minimaxi.com/docs/guides/pricing-paygo (查询于 2026-07-17)',
  pricingUnit: '元/万字符 (人民币)',
  retryCount: RETRY_COUNT,
  perItem: items,
  totals: {
    items: items.length,
    files: items.length * 2,
    totalChars,
    totalCharsClear,
    totalCharsNatural,
  },
  costByModel: {},
};

for (const [model, rate] of Object.entries(PRICING)) {
  if (rate === null) continue;
  const costTotal = (totalChars / 10000) * rate;
  report.costByModel[model] = {
    ratePer10kChars: rate,
    costTotal: +costTotal.toFixed(4),
    costPerItem: +(costTotal / items.length).toFixed(4),
    costPerFile: +(costTotal / (items.length * 2)).toFixed(4),
  };
}

fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
console.log(`[cost] wrote ${REPORT_JSON}`);
console.log(`[cost] total chars: ${totalChars} (clear=${totalCharsClear} + natural=${totalCharsNatural})`);

// === Markdown 报告 ===
const lines = [];
lines.push('# 阶段四 B — 12 条样板音频真实成本报告');
lines.push('');
lines.push(`生成时间: ${report.computedAt}`);
lines.push(`定价来源: ${report.pricingSource}`);
lines.push(`重试量: ${RETRY_COUNT} (本次 0 失败)`);
lines.push('');
lines.push('## 1. 输入字符数 (本次 12 条实际测量)');
lines.push('');
lines.push('| 序号 | 课程 | 句 id | clear 字符 | natural 字符 | 合计 |');
lines.push('|---|---|---|---|---|---|');
for (let i = 0; i < items.length; i++) {
  const it = items[i];
  lines.push(`| ${i + 1} | ${it.category} | ${it.sentenceId} | ${it.clearChars} | ${it.naturalChars} | ${it.totalChars} |`);
}
lines.push(`| **合计** | | | **${totalCharsClear}** | **${totalCharsNatural}** | **${totalChars}** |`);
lines.push('');

lines.push('## 2. 实际成本 (按 MiniMax 官方价)');
lines.push('');
lines.push('| 模型 | 单价 (元/万字符) | 12 条总成本 | 单句成本 | 单文件成本 |');
lines.push('|---|---|---|---|---|');
for (const [model, c] of Object.entries(report.costByModel)) {
  lines.push(`| ${model} | ${c.ratePer10kChars} | ¥${c.costTotal.toFixed(4)} | ¥${c.costPerItem.toFixed(4)} | ¥${c.costPerFile.toFixed(4)} |`);
}
lines.push('');

lines.push('## 3. 重试量');
lines.push('');
lines.push(`本次 24 个 mp3 调用全部一次成功, 重试 ${RETRY_COUNT} 次。`);
lines.push('若按 5% 重试率估算 (业内经验值, 非实测), 额外成本:');
lines.push('');
const retry5 = report.costByModel['speech-2.8-turbo'];
if (retry5) {
  const extra = retry5.costTotal * 0.05;
  lines.push(`- 5% 重试: ¥${extra.toFixed(4)}`);
  lines.push(`- 含重试总成本: ¥${(retry5.costTotal + extra).toFixed(4)}`);
}
lines.push('');

lines.push('## 4. 180 条全量成本预估 (基于本次字符密度)');
lines.push('');
lines.push(`本次 12 条样板合计 ${totalChars} 字符, 平均每条 ${(totalChars / items.length).toFixed(1)} 字符 (clear + natural 合计)`);
lines.push(`若 180 条按相同字符密度, 总字符数: ${(totalChars / items.length * 180).toFixed(0)}`);
lines.push('');
lines.push('| 模型 | 180 条预估总成本 | 备注 |');
lines.push('|---|---|---|');
const c180 = (totalChars / items.length * 180) / 10000;
for (const [model, c] of Object.entries(report.costByModel)) {
  const cost180 = c180 * c.ratePer10kChars;
  lines.push(`| ${model} | ¥${cost180.toFixed(2)} | 按 12 条密度外推, 实测后可能 ±20% |`);
}
lines.push('');

lines.push('## 5. 与上轮估算对比');
lines.push('');
lines.push('上轮 (PHASE4.md) 估算: "180 句 × 2 版本约 5400 字符, OpenAI TTS 总成本约 0.32 美元"');
lines.push('- 字符数对比: 旧估 5400 字符, 实际 12 条密度 180 条 ≈ ' + (totalChars / items.length * 180).toFixed(0) + ' 字符, **偏差 +' + (((totalChars / items.length * 180) - 5400) / 5400 * 100).toFixed(0) + '%**');
lines.push('- 服务对比: 旧估 OpenAI TTS-1, 实际走 MiniMax TTS (因 vault 仅有 MiniMax key)');
lines.push('- 单价对比: 旧估未引用具体模型定价, 实际 MiniMax speech-2.8-turbo 2 元/万字符 ≈ 0.28 美元/万字符');
lines.push('- 旧估 0.32 美元 = 约 2.3 元, 与实际 MiniMax turbo 估算 ' + (c180 * 2).toFixed(2) + ' 元 量级相近, 但**服务不同, 不能直接套用**');
lines.push('');

lines.push('## 6. 限制与不确定性');
lines.push('');
lines.push('1. **定价以 2026-07-17 平台公示为准**, MiniMax 历史上多次调整计费模式 (如 2025-06 token 计费风波), 后续可能再变');
lines.push('2. **当前未确认本次调用具体走的模型** (speech-2.8-turbo / hd / 2.6 等), 成本按多档分别列出');
lines.push('3. **重试率 5% 是行业经验值**, 不代表 MiniMax 实际重试率, 本次 0 重试');
lines.push('4. **没算音色克隆 / 设计的费用** (9.9 元/音色), 复用现有 English_Trustworthy_Man / English_Diligent_Man 无此费用');
lines.push('5. **没算音频存储 / CDN 流量费** (VPS 自托管, 无此费用)');
lines.push('6. **没算开发 / 调试时间成本** (实际花的时间见 docs/PHASE4.md)');
lines.push('');

fs.writeFileSync(REPORT_MD, lines.join('\n'));
console.log(`[cost] wrote ${REPORT_MD}`);

// 控制台摘要
console.log('');
console.log('=== COST SUMMARY (12 samples, 24 mp3) ===');
console.log(`totalChars: ${totalChars}`);
for (const [model, c] of Object.entries(report.costByModel)) {
  console.log(`  ${model} (¥${c.ratePer10kChars}/万字符): total ¥${c.costTotal.toFixed(4)}`);
}
