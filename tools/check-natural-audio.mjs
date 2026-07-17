#!/usr/bin/env node
/**
 * tools/check-natural-audio.mjs
 *
 * 阶段四 B — 12 条样板音频部署后 HTTP HEAD 校验。
 * 逐条访问 https://english.wujiong.cn/audio/natural/{lessonId}/{sentenceId}/{clear|natural}.mp3
 * 期望 200, 记下 size / status。
 *
 * 输出 data/natural-audio-check-12.json (校验报告) + 控制台摘要
 *
 * 运行: node tools/check-natural-audio.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SAMPLES_FILE = path.join(ROOT, 'data', 'natural-samples-12.json');
const REPORT_FILE = path.join(ROOT, 'data', 'natural-audio-check-12.json');

const BASE = 'https://english.wujiong.cn/audio/natural';

const samples = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8')).samples;

const report = {
  checkedAt: new Date().toISOString(),
  base: BASE,
  total: 0,
  passed: 0,
  failed: 0,
  items: [],
};

for (const s of samples) {
  for (const v of ['clear', 'natural']) {
    const url = `${BASE}/${s.lessonId}/${s.sentenceId}/${v}.mp3`;
    report.total++;
    const item = { lessonId: s.lessonId, sentenceId: s.sentenceId, version: v, url, status: null, size: null, error: null };
    try {
      const r = await fetch(url, { method: 'HEAD' });
      item.status = r.status;
      item.size = Number(r.headers.get('content-length') || 0);
      if (r.status === 200) {
        report.passed++;
      } else {
        report.failed++;
        item.error = `HTTP ${r.status}`;
      }
    } catch (e) {
      report.failed++;
      item.status = 'EXCEPTION';
      item.error = e.message || String(e);
    }
    report.items.push(item);
  }
}

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`[check] ${report.passed}/${report.total} passed (${report.failed} failed)`);
console.log(`[check] wrote ${REPORT_FILE}`);

if (report.failed > 0) {
  console.log('[check] failed items:');
  for (const it of report.items) {
    if (it.status !== 200) console.log(`  ${it.lessonId}/${it.sentenceId}/${it.version}.mp3 -> ${it.status} ${it.error || ''}`);
  }
}
