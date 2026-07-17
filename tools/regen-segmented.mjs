#!/usr/bin/env node
/**
 * tools/regen-segmented.mjs
 *
 * 阶段四 B 修复 — 重建 audioSegmented 字段
 *
 * 流程:
 *   1. 读 natural-sentences.json
 *   2. 对 audioSegmented 含 pending 的句子, 收集 regen requests
 *   3. 输出:
 *      - data/regen-segmented-batch-list.json (给 agent 跑 TTS)
 *      - data/regen-segmented-needed.json (按 lesson 分类, 含旧/新 chunks)
 *   4. 单独跑 TTS + 部署后, 再用 regen-segmented-backfill.mjs 回填
 *
 * 运行: node tools/regen-segmented.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const BATCH_FILE = path.join(ROOT, 'data', 'regen-segmented-batch-list.json');
const NEEDED_FILE = path.join(ROOT, 'data', 'regen-segmented-needed.json');

const BATCH_SIZE = 8;
const BASE = 'https://english.wujiong.cn/audio/natural';
const AUDIO_DIR = path.join(ROOT, 'audio', 'natural');

const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));

// 读 provider (从 natural-samples-12.json 拿)
const samplesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'natural-samples-12.json'), 'utf8'));
const provider = samplesData.provider;

const requests = [];  // { lessonId, sentenceId, chunkIndex, version, text, outputPath }
const neededByLesson = {};

for (const lesson of data.lessons) {
  neededByLesson[lesson.id] = [];
  for (const s of lesson.sentences) {
    const segs = s.audioSegmented || [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      // 跳过 audio mp3 已就绪的
      if (seg.clearStatus === 'ready' && seg.naturalStatus === 'ready') continue;
      // 跳过 audio mp3 已部署 + clearUrl 存在（无需重生成）
      if (seg.clearStatus === 'ready' && seg.naturalStatus === 'ready' && seg.clearUrl && seg.naturalUrl) continue;
      // 待重生
      for (const v of ['clear', 'natural']) {
        const outputPath = `audio/natural/${lesson.id}/${s.id}/${v}-seg${i}.mp3`;
        requests.push({
          lessonId: lesson.id,
          sentenceId: s.id,
          chunkIndex: i,
          totalChunks: segs.length,
          version: v,
          text: seg.clearText,  // 慢速/自然都用同样文本 (natural 自然语速整体)
          outputPath,
          voice: v === 'clear' ? provider.clearVoice : provider.naturalVoice,
          speed: v === 'clear' ? provider.clearSpeed : provider.naturalSpeed,
        });
        neededByLesson[lesson.id].push({
          sentenceId: s.id,
          chunkIndex: i,
          version: v,
          text: seg.clearText,
        });
      }
    }
  }
}

console.log(`[regen-segmented] total requests: ${requests.length}`);
console.log(`[regen-segmented] by lesson:`);
for (const l of Object.keys(neededByLesson)) {
  if (neededByLesson[l].length > 0) console.log(`  ${l}: ${neededByLesson[l].length} files`);
}

// 切批
const batches = [];
for (let i = 0; i < requests.length; i += BATCH_SIZE) {
  const items = requests.slice(i, i + BATCH_SIZE);
  batches.push({
    batchId: `regen-batch-${String(batches.length + 1).padStart(3, '0')}`,
    startIndex: i,
    endIndex: i + items.length - 1,
    count: items.length,
    items,
  });
}

const totalChars = requests.reduce((s, r) => s + r.text.length, 0);
const totalSec = requests.reduce((s, r) => s + r.text.length / (12 * r.speed), 0);

const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    reason: 'speechChunks 修复后, audioSegmented 重建',
    totalRequests: requests.length,
    totalBatches: batches.length,
    batchSize: BATCH_SIZE,
    provider: provider.name,
    model: provider.model,
    base: BASE,
    totalChars,
    totalSecEstimate: +totalSec.toFixed(2),
  },
  batches,
};
fs.writeFileSync(BATCH_FILE, JSON.stringify(out, null, 2));
fs.writeFileSync(NEEDED_FILE, JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalRequests: requests.length,
  byLesson: neededByLesson,
}, null, 2));

console.log(`[regen-segmented] wrote ${BATCH_FILE}`);
console.log(`[regen-segmented] wrote ${NEEDED_FILE}`);
console.log(`[regen-segmented] ${batches.length} batches, ${requests.length} requests, ${totalChars} chars, ~${totalSec.toFixed(0)}s audio`);
