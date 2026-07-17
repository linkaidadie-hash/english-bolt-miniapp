#!/usr/bin/env node
/**
 * tools/backfill-natural-audio.mjs
 *
 * 阶段四 B — 把 12 条已部署音频的 audioClear / audioNatural 字段回填到
 * data/natural-sentences.json。**不触碰**其余 168 条 pending 字段。
 *
 * 同时同步生成:
 *   - miniprogram/data/natural-sentences.js  (inline require, 包)
 *
 * 同步 GitHub push 之前需要重跑 tools/push-to-github.mjs。
 *
 * 运行: node tools/backfill-natural-audio.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SAMPLES_FILE = path.join(ROOT, 'data', 'natural-samples-12.json');
const CHECK_FILE = path.join(ROOT, 'data', 'natural-audio-check-12.json');
const META_FILE = path.join(ROOT, 'data', 'natural-audio-meta-12.json');
const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const SENTENCES_JS = path.join(ROOT, 'miniprogram', 'data', 'natural-sentences.js');

const BASE = 'https://english.wujiong.cn/audio/natural';

const samples = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8')).samples;
const check = JSON.parse(fs.readFileSync(CHECK_FILE, 'utf8'));
const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));

// 校验: 必须是 24/24 通过才能回填
if (check.passed !== check.total) {
  console.error(`[backfill] ABORT: check.passed=${check.passed} !== ${check.total}. Fix VPS first.`);
  process.exit(1);
}

// 建查找表: (lessonId, sentenceId, version) -> { size, duration, url }
const lookup = new Map();
for (const item of check.items) {
  lookup.set(`${item.lessonId}/${item.sentenceId}/${item.version}`, {
    url: item.url,
    size: item.size,
  });
}
for (const s of meta.samples) {
  for (const v of ['clear', 'natural']) {
    const m = s.files[v].meta;
    const key = `${s.lessonId}/${s.sentenceId}/${v}`;
    const lookupItem = lookup.get(key);
    if (!lookupItem) continue;
    lookupItem.duration = m.duration;
    lookupItem.voice = m.voice;
    lookupItem.speed = m.speed;
    lookupItem.contentHash = m.contentHash;
    lookupItem.fileHash = m.fileHash;
    lookupItem.sourceText = m.sourceText;
  }
}

// 读 + 改 + 写 sentences.json
const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));

let filledCount = 0;
const report = [];

for (const lesson of data.lessons) {
  for (const s of lesson.sentences) {
    for (const v of ['clear', 'natural']) {
      const item = lookup.get(`${lesson.id}/${s.id}/${v}`);
      if (!item) continue;  // not in the 12-sample set, skip
      const field = v === 'clear' ? 'audioClear' : 'audioNatural';
      s[field] = {
        status: 'ready',
        url: item.url,
        duration: item.duration,
        size: item.size,
      };
      report.push({
        lessonId: lesson.id, sentenceId: s.id, version: v,
        url: item.url, size: item.size, duration: item.duration,
        voice: item.voice, speed: item.speed,
      });
      filledCount++;
    }
  }
}

if (filledCount !== 24) {
  console.error(`[backfill] ABORT: filled ${filledCount} != 24 expected`);
  process.exit(1);
}

fs.writeFileSync(SENTENCES_FILE, JSON.stringify(data, null, 2));
console.log(`[backfill] wrote ${SENTENCES_FILE}, filled ${filledCount} audio fields`);

// 同步 inline require
const wrapped = '// Auto-generated from data/natural-sentences.json\n// Phase 4A skeleton — 9 lessons × 20 sentences = 180 total\n// Phase 4B — 12 sample audio ready (24 mp3), 168 still pending\n\nmodule.exports = ' + JSON.stringify(data) + ';\n';
fs.writeFileSync(SENTENCES_JS, wrapped);
console.log(`[backfill] wrote ${SENTENCES_JS}`);

// 写个 backfill 报告
const backfillReport = {
  filledAt: new Date().toISOString(),
  total: 24,
  lessons: {},
};
for (const r of report) {
  backfillReport.lessons[r.lessonId] = backfillReport.lessons[r.lessonId] || { count: 0, items: [] };
  backfillReport.lessons[r.lessonId].count++;
  backfillReport.lessons[r.lessonId].items.push({ sentenceId: r.sentenceId, version: r.version, url: r.url, size: r.size, duration: r.duration, voice: r.voice, speed: r.speed });
}
fs.writeFileSync(path.join(ROOT, 'data', 'natural-audio-backfill-12.json'), JSON.stringify(backfillReport, null, 2));
console.log(`[backfill] wrote data/natural-audio-backfill-12.json`);
