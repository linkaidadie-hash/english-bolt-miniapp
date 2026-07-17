#!/usr/bin/env node
/**
 * tools/backfill-natural-audio-all.mjs
 *
 * 阶段四 B Part 1 收尾 — 全量回填 180 句 × 2 = 360 audio 到
 * data/natural-sentences.json 的 audioClear / audioNatural 字段。
 *
 * 从 audio/natural/{lessonId}/{sentenceId}/{clear|natural}.mp3 扫描本地文件:
 *   - 存在 → status=ready, url, size, duration
 *   - 不存在 → 保持原样 (status=pending, url=null)
 *
 * 同时同步生成:
 *   - miniprogram/data/natural-sentences.js (inline require)
 *
 * 运行: node tools/backfill-natural-audio-all.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SAMPLES_FILE = path.join(ROOT, 'data', 'natural-samples-12.json');
const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const SENTENCES_JS = path.join(ROOT, 'miniprogram', 'data', 'natural-sentences.js');
const REPORT_FILE = path.join(ROOT, 'data', 'natural-audio-backfill-all.json');

const BASE = 'https://english.wujiong.cn/audio/natural';
const AUDIO_DIR = path.join(ROOT, 'audio', 'natural');

// 读 provider 配置 (voice/speed 来自 12 样本的样板)
const samplesData = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
const provider = samplesData.provider;

// 估算 mp3 duration (16KB/s @ 128kbps, 与 generate-audio-meta.mjs 一致)
function estimateDuration(fileSize) {
  return +(fileSize / 16000).toFixed(2);
}

// 读 + 改 + 写
const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));
const t0 = Date.now();

let filled = 0;
let missing = 0;
const missingList = [];
const report = {
  filledAt: new Date().toISOString(),
  provider: provider.name,
  model: provider.model,
  total: data.lessons.length * 20 * 2,  // 180 × 2
  filled: 0,
  missing: 0,
  totalSize: 0,
  totalDuration: 0,
  perLesson: {},
};

for (const lesson of data.lessons) {
  const perLesson = { filled: 0, missing: 0, items: [] };
  for (const s of lesson.sentences) {
    for (const v of ['clear', 'natural']) {
      const field = v === 'clear' ? 'audioClear' : 'audioNatural';
      const mp3Path = path.join(AUDIO_DIR, lesson.id, s.id, `${v}.mp3`);
      const url = `${BASE}/${lesson.id}/${s.id}/${v}.mp3`;

      if (fs.existsSync(mp3Path)) {
        const size = fs.statSync(mp3Path).size;
        const duration = estimateDuration(size);
        s[field] = {
          status: 'ready',
          url,
          duration,
          size,
        };
        filled++;
        perLesson.filled++;
        perLesson.items.push({ sentenceId: s.id, version: v, url, size, duration });
        report.totalSize += size;
        report.totalDuration += duration;
      } else {
        // 不存在 → 保持 pending (但若之前是 ready, 标 missing)
        if (s[field] && s[field].status === 'ready') {
          s[field] = { status: 'missing', url: null, duration: null, size: null };
        }
        missing++;
        perLesson.missing++;
        missingList.push({ lessonId: lesson.id, sentenceId: s.id, version: v });
      }
    }
  }
  report.perLesson[lesson.id] = perLesson;
}

report.filled = filled;
report.missing = missing;
report.avgSize = filled > 0 ? Math.round(report.totalSize / filled) : 0;
report.avgDuration = filled > 0 ? +(report.totalDuration / filled).toFixed(2) : 0;
report.totalSizeMB = +(report.totalSize / 1048576).toFixed(3);
report.missingItems = missingList;
report.durationMs = Date.now() - t0;

// 写 sentences.json
fs.writeFileSync(SENTENCES_FILE, JSON.stringify(data, null, 2));

// 同步 inline require
const wrapped = `// Auto-generated from data/natural-sentences.json
// Phase 4A skeleton — 9 lessons × 20 sentences = 180 total
// Phase 4B Part 1 — ${filled} audio ready, ${missing} missing
// Generated at: ${new Date().toISOString()}

module.exports = ${JSON.stringify(data)};
`;
fs.writeFileSync(SENTENCES_JS, wrapped);

// 写报告
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

const t = Date.now() - t0;
console.log(`[backfill-all] ${filled}/${report.total} ready, ${missing} missing (${t}ms)`);
console.log(`[backfill-all] wrote ${SENTENCES_FILE}`);
console.log(`[backfill-all] wrote ${SENTENCES_JS}`);
console.log(`[backfill-all] wrote ${REPORT_FILE}`);
if (missing > 0) {
  console.log(`[backfill-all] missing items:`);
  for (const m of missingList) console.log(`  ${m.lessonId}/${m.sentenceId}/${m.version}`);
}
