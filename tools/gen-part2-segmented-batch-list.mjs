#!/usr/bin/env node
/**
 * tools/gen-part2-segmented-batch-list.mjs
 *
 * 阶段四 B Part 2 — 把 180 句按 speechChunks 拆成 405 chunks × 2 (clear/natural) = 810 segmented audio。
 *
 * 输出 data/natural-segmented-batch-list.json:
 *   {
 *     meta: { ... },
 *     batches: [
 *       { batchId, items: [{lessonId, sentenceId, chunkIndex, version, text, outputPath, voice, speed}] }
 *     ]
 *   }
 *
 * 路径约定:
 *   本地: audio/natural/{lessonId}/{sentenceId}/{clear|natural}-seg{N}.mp3
 *   CDN:  https://english.wujiong.cn/audio/natural/{lessonId}/{sentenceId}/{clear|natural}-seg{N}.mp3
 *
 * schema 更新 (backfill 后):
 *   audioSegmented: [
 *     { chunkIndex, text, status: 'pending'|'ready'|'missing', url, duration, size },
 *     ...
 *   ]
 *
 * 运行: node tools/gen-part2-segmented-batch-list.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const SAMPLES_FILE = path.join(ROOT, 'data', 'natural-samples-12.json');
const BATCH_FILE = path.join(ROOT, 'data', 'natural-segmented-batch-list.json');

const BATCH_SIZE = 8;  // 与 Part 1 一致 (TTS 限流安全)

const samplesData = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
const provider = samplesData.provider;
const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));

// 1. 拆 405 chunks
const chunks = [];  // {lessonId, sentenceId, chunkIndex, version, text, outputPath}
for (const lesson of data.lessons) {
  for (const s of lesson.sentences) {
    const clearChunks = s.speechChunks;
    const naturalChunks = s.speechChunks;  // speechChunks 文本是按 clear 切的, natural 用同一意群但拼写变化在 naturalText 里
    for (let i = 0; i < clearChunks.length; i++) {
      const version = 'clear';
      // 直接拿 clearText 的 chunk (慢速清晰版, 一字一字)
      // 不用拼接 clearText, 因为 speechChunks 已经是按意群切好的字符串
      const text = clearChunks[i];
      const outputPath = `audio/natural/${lesson.id}/${s.id}/${version}-seg${i}.mp3`;
      chunks.push({
        lessonId: lesson.id,
        sentenceId: s.id,
        chunkIndex: i,
        totalChunks: clearChunks.length,
        version,
        text,
        outputPath,
        voice: provider.clearVoice,
        speed: provider.clearSpeed,
      });
    }
    for (let i = 0; i < naturalChunks.length; i++) {
      const version = 'natural';
      // 重要: naturalText 的 chunk 也要按意群切
      // 但 naturalText 整体拼写变化, 不能简单按 clearText chunk 切
      // 简单做法: 按字符比例切 (因为 naturalText ≈ clearText 的自然变体, 长度近似)
      const totalChars = s.clearText.length;
      const naturalText = s.naturalText;
      let startChar, endChar;
      if (i === 0) {
        startChar = 0;
        endChar = Math.round(naturalText.length * clearChunks[0].length / totalChars);
      } else if (i === naturalChunks.length - 1) {
        startChar = Math.round(naturalText.length * clearChunks.slice(0, i).reduce((a, b) => a + b.length, 0) / totalChars);
        endChar = naturalText.length;
      } else {
        const beforeLen = clearChunks.slice(0, i).reduce((a, b) => a + b.length, 0);
        const thisLen = clearChunks[i].length;
        startChar = Math.round(naturalText.length * beforeLen / totalChars);
        endChar = Math.round(naturalText.length * (beforeLen + thisLen) / totalChars);
      }
      const text = naturalText.slice(startChar, endChar).trim();
      const outputPath = `audio/natural/${lesson.id}/${s.id}/${version}-seg${i}.mp3`;
      chunks.push({
        lessonId: lesson.id,
        sentenceId: s.id,
        chunkIndex: i,
        totalChunks: naturalChunks.length,
        version,
        text,
        outputPath,
        voice: provider.naturalVoice,
        speed: provider.naturalSpeed,
      });
    }
  }
}

console.log(`[part2] total chunks: ${chunks.length} (expected 810)`);
if (chunks.length !== 810) {
  console.error(`[part2] ABORT: expected 810, got ${chunks.length}`);
  process.exit(1);
}

// 2. 切批 (按 BATCH_SIZE)
const batches = [];
for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batchItems = chunks.slice(i, i + BATCH_SIZE);
  batches.push({
    batchId: `seg-batch-${String(batches.length + 1).padStart(3, '0')}`,
    startIndex: i,
    endIndex: i + batchItems.length - 1,
    count: batchItems.length,
    items: batchItems,
  });
}

const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
const totalSecEstimate = chunks.reduce((sum, c) => sum + (c.text.length / (12 * c.speed)), 0);

const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    totalChunks: chunks.length,
    totalBatches: batches.length,
    batchSize: BATCH_SIZE,
    provider: provider.name,
    model: provider.model,
    clearVoice: provider.clearVoice,
    naturalVoice: provider.naturalVoice,
    clearSpeed: provider.clearSpeed,
    naturalSpeed: provider.naturalSpeed,
    pathPattern: {
      local: 'audio/natural/{lessonId}/{sentenceId}/{clear|natural}-seg{N}.mp3',
      cdn: 'https://english.wujiong.cn/audio/natural/{lessonId}/{sentenceId}/{clear|natural}-seg{N}.mp3',
    },
    schemaNote: 'audioSegmented: Array<{chunkIndex, text, status, url, duration, size}>',
    totalChars,
    totalSecEstimate: +totalSecEstimate.toFixed(2),
    note: '8 批 × ~100 文件, 与 Part 1 一致节奏; natural text chunk 按 clear 比例切',
  },
  batches,
};

fs.writeFileSync(BATCH_FILE, JSON.stringify(out, null, 2));
console.log(`[part2] wrote ${BATCH_FILE}`);
console.log(`[part2] ${batches.length} batches, ${chunks.length} chunks, ${totalChars} chars, ~${totalSecEstimate.toFixed(0)}s audio`);
