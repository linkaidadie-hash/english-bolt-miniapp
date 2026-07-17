#!/usr/bin/env node
/**
 * tools/check-natural-segmented.mjs
 *
 * 阶段四 B Part 2 — 810 segmented audio (180 句 × 2) HTTP HEAD 校验
 * 并发 16, 找出 404 / EXCEPTION 的 file
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const REPORT_FILE = path.join(ROOT, 'data', 'natural-segmented-check.json');

const BASE = 'https://english.wujiong.cn/audio/natural';
const CONCURRENCY = 16;

const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));
const queue = [];
for (const lesson of data.lessons) {
  for (const s of lesson.sentences) {
    for (const seg of (s.audioSegmented || [])) {
      for (const v of ['clear', 'natural']) {
        const url = seg[v + 'Url'];
        if (url) queue.push({ lessonId: lesson.id, sentenceId: s.id, chunkIndex: seg.chunkIndex, version: v, url });
      }
    }
  }
}

console.log(`[check-seg] total: ${queue.length}`);

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
  failures: failed.map(i => ({ lessonId: i.lessonId, sentenceId: i.sentenceId, chunkIndex: i.chunkIndex, version: i.version, url: i.url, status: i.status, error: i.error })),
};
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`[check-seg] ${passed}/${report.total} passed in ${dt}ms`);
if (failed.length) {
  console.log(`[check-seg] failed:`);
  for (const f of failed) console.log(`  ${f.lessonId}/${f.sentenceId}/seg${f.chunkIndex}/${f.version} -> ${f.status}`);
}
