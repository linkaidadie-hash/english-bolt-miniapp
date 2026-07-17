#!/usr/bin/env node
/**
 * tools/gen-part1-batch-list.mjs
 *
 * 阶段四 B Part 1 — 生成 336 个 full audio (168 句 × 2 版本) 的 TTS 请求清单
 *
 * 输出: 42 批 × 8 请求, 直接喂给 batch_synthesize_speech
 *
 * 运行: node tools/gen-part1-batch-list.mjs > part1-batches.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const SAMPLE_PROVIDER = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'natural-samples-12.json'), 'utf8')).provider;

const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));

const requests = [];
for (const lesson of data.lessons) {
  for (const s of lesson.sentences) {
    if (s.audioClear.status === 'ready' && s.audioNatural.status === 'ready') continue;  // skip done
    for (const v of ['clear', 'natural']) {
      const text = v === 'clear' ? s.clearText : s.naturalText;
      const voice = v === 'clear' ? SAMPLE_PROVIDER.clearVoice : SAMPLE_PROVIDER.naturalVoice;
      const speed = v === 'clear' ? SAMPLE_PROVIDER.clearSpeed : SAMPLE_PROVIDER.naturalSpeed;
      const out = `audio/natural/${lesson.id}/${s.id}/${v}.mp3`;
      requests.push({ text, voice_id: voice, speed, emotion: 'neutral', output_file_path: out, _meta: { lessonId: lesson.id, sentenceId: s.id, version: v } });
    }
  }
}

console.log(`[part1] total requests: ${requests.length}`);

// 分批 8
const BATCH_SIZE = 8;
const batches = [];
for (let i = 0; i < requests.length; i += BATCH_SIZE) {
  batches.push(requests.slice(i, i + BATCH_SIZE));
}
console.log(`[part1] total batches: ${batches.length}`);

for (let i = 0; i < batches.length; i++) {
  console.log(`---BATCH_${i + 1}---`);
  for (const r of batches[i]) {
    console.log(JSON.stringify(r));
  }
}
