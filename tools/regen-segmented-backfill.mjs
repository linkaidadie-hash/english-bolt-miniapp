#!/usr/bin/env node
/**
 * tools/regen-segmented-backfill.mjs
 *
 * 阶段四 B 修复 — 把 regen 后的 audioSegmented mp3 状态回填到 data/natural-sentences.json
 *
 * 流程:
 *   1. 读 regen-segmented-batch-list.json
 *   2. 对每个 batch, 检查本地 audio/natural/.../seg.mp3 是否存在
 *      - 存在 → status='ready', url=https://english.wujiong.cn/...
 *      - 不存在 → status='missing'
 *   3. 写回 natural-sentences.json + 重新生成 inline require
 *
 * 运行: node tools/regen-segmented-backfill.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BATCH_FILE = path.join(ROOT, 'data', 'regen-segmented-batch-list.json');
const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const SENTENCES_JS = path.join(ROOT, 'miniprogram', 'data', 'natural-sentences.js');
const REPORT_FILE = path.join(ROOT, 'data', 'regen-segmented-backfill.json');

const BASE = 'https://english.wujiong.cn/audio/natural';
const AUDIO_DIR = path.join(ROOT, 'audio', 'natural');

function estimateDuration(fileSize) {
  return +(fileSize / 16000).toFixed(2);
}

const batchData = JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8'));
const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));

// 建查找表
const lookup = new Map();
for (const b of batchData.batches) {
  for (const it of b.items) {
    lookup.set(`${it.lessonId}/${it.sentenceId}/${it.version}-seg${it.chunkIndex}`, it);
  }
}

// 回填
let filled = 0;
let missing = 0;
const missingItems = [];
const report = { filledAt: new Date().toISOString(), totalUpdates: 0, filled, missing, missingItems };

for (const lesson of data.lessons) {
  for (const s of lesson.sentences) {
    let updated = false;
    for (let i = 0; i < (s.audioSegmented || []).length; i++) {
      const seg = s.audioSegmented[i];
      for (const v of ['clear', 'natural']) {
        const key = `${lesson.id}/${s.id}/${v}-seg${i}`;
        if (!lookup.has(key)) continue;  // not in regen list
        const mp3Path = path.join(AUDIO_DIR, lesson.id, s.id, `${v}-seg${i}.mp3`);
        const url = `${BASE}/${lesson.id}/${s.id}/${v}-seg${i}.mp3`;
        if (fs.existsSync(mp3Path)) {
          const size = fs.statSync(mp3Path).size;
          const field = v === 'clear' ? 'clearStatus' : 'naturalStatus';
          const urlField = v === 'clear' ? 'clearUrl' : 'naturalUrl';
          const durField = v === 'clear' ? 'clearDuration' : 'naturalDuration';
          seg[field] = 'ready';
          seg[urlField] = url;
          seg[durField] = estimateDuration(size);
          filled++;
          updated = true;
        } else {
          const field = v === 'clear' ? 'clearStatus' : 'naturalStatus';
          seg[field] = 'missing';
          missingItems.push(`${lesson.id}/${s.id}/${v}-seg${i}`);
          missing++;
          updated = true;
        }
      }
    }
    if (updated) report.totalUpdates++;
  }
}

report.filled = filled;
report.missing = missing;

// 写 sentences.json
fs.writeFileSync(SENTENCES_FILE, JSON.stringify(data, null, 2));

// 写 inline require
const wrapped = `// Auto-generated from data/natural-sentences.json
// Phase 4B — chunks + audioSegmented 全部回填
// Generated at: ${new Date().toISOString()}

module.exports = ${JSON.stringify(data)};
`;
fs.writeFileSync(SENTENCES_JS, wrapped);

// 写 report
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

console.log(`[backfill-regen] updated: ${report.totalUpdates} sentences, ${filled} segs ready, ${missing} missing`);
console.log(`[backfill-regen] wrote ${SENTENCES_FILE}`);
console.log(`[backfill-regen] wrote ${SENTENCES_JS}`);
console.log(`[backfill-regen] wrote ${REPORT_FILE}`);
