#!/usr/bin/env node
/**
 * tools/check-natural-audio-fast.mjs
 *
 * 并发 HTTP HEAD check 360 audio，写入 report。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const REPORT_FILE = path.join(ROOT, 'data', 'natural-audio-check-fast.json');

const BASE = 'https://english.wujiong.cn/audio/natural';
const CONCURRENCY = 16;

const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));
const queue = [];
for (const lesson of data.lessons) {
  for (const s of lesson.sentences) {
    for (const v of ['clear', 'natural']) {
      queue.push({ lessonId: lesson.id, sentenceId: s.id, version: v, url: `${BASE}/${lesson.id}/${s.id}/${v}.mp3` });
    }
  }
}

const items = new Array(queue.length);
let cursor = 0;
async function worker() {
  while (cursor < queue.length) {
    const i = cursor++;
    const q = queue[i];
    const item = { ...q, status: null, size: 0, error: null };
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(q.url, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(t);
      item.status = r.status;
      item.size = Number(r.headers.get('content-length') || 0);
      if (r.status !== 200) item.error = `HTTP ${r.status}`;
    } catch (e) {
      item.status = 'EXCEPTION';
      item.error = e.message || String(e);
    }
    items[i] = item;
  }
}

const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const dt = Date.now() - t0;

const passed = items.filter(i => i.status === 200).length;
const failed = items.filter(i => i.status !== 200);

const report = {
  checkedAt: new Date().toISOString(),
  base: BASE,
  total: items.length,
  passed,
  failed: failed.length,
  durationMs: dt,
  concurrency: CONCURRENCY,
  failures: failed.map(i => ({ lessonId: i.lessonId, sentenceId: i.sentenceId, version: i.version, url: i.url, status: i.status, error: i.error })),
};
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`[check-fast] ${passed}/${report.total} passed in ${dt}ms (concurrency=${CONCURRENCY})`);
if (failed.length) {
  console.log(`[check-fast] ${failed.length} failed:`);
  for (const f of failed) console.log(`  ${f.lessonId}/${f.sentenceId}/${f.version} -> ${f.status} ${f.error || ''}`);
} else {
  console.log(`[check-fast] wrote ${REPORT_FILE}`);
}
