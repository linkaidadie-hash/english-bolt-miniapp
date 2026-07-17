#!/usr/bin/env node
/**
 * tools/backfill-natural-segmented.mjs
 *
 * 阶段四 B Part 2 收尾 — 回填 audioSegmented 字段到 data/natural-sentences.json。
 *
 * schema:
 *   audioSegmented: Array<{
 *     chunkIndex,         // 0..N
 *     text,               // 原始 chunk 文本 (clearText 切分)
 *     clearText,          // 慢速版本 (用于 UI 切分)
 *     naturalText,        // 自然版本 (用于 UI 切分, 可能是整段或按 chunk 切)
 *     clearUrl,           // HTTPS URL clear
 *     naturalUrl,         // HTTPS URL natural
 *     clearStatus,        // 'ready' | 'missing'
 *     naturalStatus,      // 'ready' | 'missing'
 *     clearDuration,      // 估算秒
 *     naturalDuration,
 *   }>
 *
 * 同时同步生成:
 *   - miniprogram/data/natural-sentences.js (inline require)
 *
 * 运行: node tools/backfill-natural-segmented.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const SENTENCES_JS = path.join(ROOT, 'miniprogram', 'data', 'natural-sentences.js');
const REPORT_FILE = path.join(ROOT, 'data', 'natural-audio-backfill-segmented.json');

const BASE = 'https://english.wujiong.cn/audio/natural';
const AUDIO_DIR = path.join(ROOT, 'audio', 'natural');

function estimateDuration(fileSize) {
  return +(fileSize / 16000).toFixed(2);
}

const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));
const t0 = Date.now();

let filled = 0;
let partialFilled = 0;
let missing = 0;
const missingItems = [];
const report = {
  filledAt: new Date().toISOString(),
  totalSentences: data.lessons.length * 20,
  totalChunks: 0,
  clearReady: 0,
  naturalReady: 0,
  partialFilled,
  missing,
  perLesson: {},
  missingItems,
};

for (const lesson of data.lessons) {
  const perLesson = { sentences: 0, chunks: 0, clearReady: 0, naturalReady: 0, missing: 0 };
  for (const s of lesson.sentences) {
    perLesson.sentences++;
    const chunks = s.speechChunks;
    const segArr = [];
    for (let i = 0; i < chunks.length; i++) {
      const seg = {
        chunkIndex: i,
        text: chunks[i],
        clearText: chunks[i],
        naturalText: chunks[i],  // 同文本, 但 TTS 整段塞, 实际听感 = naturalText 整段
        clearUrl: null,
        naturalUrl: null,
        clearStatus: 'missing',
        naturalStatus: 'missing',
        clearDuration: null,
        naturalDuration: null,
      };
      const clearPath = path.join(AUDIO_DIR, lesson.id, s.id, `clear-seg${i}.mp3`);
      const naturalPath = path.join(AUDIO_DIR, lesson.id, s.id, `natural-seg${i}.mp3`);
      if (fs.existsSync(clearPath)) {
        const size = fs.statSync(clearPath).size;
        seg.clearUrl = `${BASE}/${lesson.id}/${s.id}/clear-seg${i}.mp3`;
        seg.clearStatus = 'ready';
        seg.clearDuration = estimateDuration(size);
        perLesson.clearReady++;
        report.clearReady++;
      } else {
        missingItems.push({ lessonId: lesson.id, sentenceId: s.id, version: 'clear', chunkIndex: i });
      }
      if (fs.existsSync(naturalPath)) {
        const size = fs.statSync(naturalPath).size;
        seg.naturalUrl = `${BASE}/${lesson.id}/${s.id}/natural-seg${i}.mp3`;
        seg.naturalStatus = 'ready';
        seg.naturalDuration = estimateDuration(size);
        perLesson.naturalReady++;
        report.naturalReady++;
      } else {
        missingItems.push({ lessonId: lesson.id, sentenceId: s.id, version: 'natural', chunkIndex: i });
      }
      segArr.push(seg);
    }
    s.audioSegmented = segArr;
    const bothReady = segArr.every(c => c.clearStatus === 'ready' && c.naturalStatus === 'ready');
    if (bothReady) filled++;
    else if (segArr.some(c => c.clearStatus === 'ready' || c.naturalStatus === 'ready')) partialFilled++;
    else missing++;
    perLesson.chunks += chunks.length;
    report.totalChunks += chunks.length;
  }
  report.perLesson[lesson.id] = perLesson;
}

report.filled = filled;
report.partialFilled = partialFilled;
report.missing = missing;
report.durationMs = Date.now() - t0;

// 更新 meta schema 说明
data.meta.audioStatus = 'part2-segments-ready';
data.meta.schema.audioSegmented = {
  type: 'array<SegmentedAudio>',
  schema: {
    chunkIndex: '0..N',
    text: '原始 chunk 文本 (clearText 切分)',
    clearText: '慢速版本 (用于 UI 切分)',
    naturalText: '自然版本 (TTS 整段塞到所有 chunk, 听感 = naturalText 整段)',
    clearUrl: 'HTTPS URL clear-seg{N}.mp3',
    naturalUrl: 'HTTPS URL natural-seg{N}.mp3',
    clearStatus: "'ready' | 'missing'",
    naturalStatus: "'ready' | 'missing'",
  },
};

// 写 sentences.json
fs.writeFileSync(SENTENCES_FILE, JSON.stringify(data, null, 2));

// 同步 inline require
const wrapped = `// Auto-generated from data/natural-sentences.json
// Phase 4A skeleton — 9 lessons × 20 sentences = 180 total
// Phase 4B Part 1 — 360 full-sentence audio (clear + natural) ready
// Phase 4B Part 2 — ${filled} sentences with full segmented audio, ${partialFilled} partial, ${missing} missing
// Generated at: ${new Date().toISOString()}

module.exports = ${JSON.stringify(data)};
`;
fs.writeFileSync(SENTENCES_JS, wrapped);

// 写报告
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

const t = Date.now() - t0;
console.log(`[backfill-seg] ${filled}/${report.totalSentences} fully ready, ${partialFilled} partial, ${missing} missing (${t}ms)`);
console.log(`[backfill-seg] ${report.clearReady} clear segments ready, ${report.naturalReady} natural segments ready (out of ${report.totalChunks * 2} total)`);
console.log(`[backfill-seg] wrote ${SENTENCES_FILE}`);
console.log(`[backfill-seg] wrote ${SENTENCES_JS}`);
console.log(`[backfill-seg] wrote ${REPORT_FILE}`);
if (missing > 0) {
  console.log(`[backfill-seg] missing sentences: ${missing}`);
}
if (report.missingItems.length > 0) {
  console.log(`[backfill-seg] first 10 missing items:`);
  for (const m of report.missingItems.slice(0, 10)) console.log(`  ${m.lessonId}/${m.sentenceId}/${m.version}-seg${m.chunkIndex}`);
}
