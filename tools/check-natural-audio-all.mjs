#!/usr/bin/env node
/**
 * tools/check-natural-audio-all.mjs
 *
 * 阶段四 B Part 2 — 全部 360 audio (180 句 × 2 版本) HTTP HEAD 校验
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const REPORT_FILE = path.join(ROOT, 'data', 'natural-audio-check-all.json');

const BASE = 'https://english.wujiong.cn/audio/natural';
const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));

const items = [];
let passed = 0, failed = 0;
const startTime = Date.now();

for (const lesson of data.lessons) {
  for (const s of lesson.sentences) {
    for (const v of ['clear', 'natural']) {
      const url = `${BASE}/${lesson.id}/${s.id}/${v}.mp3`;
      const item = { lessonId: lesson.id, sentenceId: s.id, version: v, url, status: null, size: null, error: null };
      try {
        const r = await fetch(url, { method: 'HEAD' });
        item.status = r.status;
        item.size = Number(r.headers.get('content-length') || 0);
        if (r.status === 200) passed++;
        else { failed++; item.error = `HTTP ${r.status}`; }
      } catch (e) {
        failed++;
        item.status = 'EXCEPTION';
        item.error = e.message || String(e);
      }
      items.push(item);
    }
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  base: BASE,
  total: items.length,
  passed,
  failed,
  duration: Date.now() - startTime,
  items,
};
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`[check-all] ${passed}/${report.total} passed (${failed} failed), ${report.duration}ms`);
console.log(`[check-all] wrote ${REPORT_FILE}`);

if (failed > 0) {
  console.log('[check-all] failed items:');
  for (const it of items) {
    if (it.status !== 200) console.log(`  ${it.lessonId}/${it.sentenceId}/${it.version}.mp3 -> ${it.status} ${it.error || ''}`);
  }
}
