#!/usr/bin/env node
/**
 * tools/generate-audio-meta.mjs
 *
 * 阶段四 B — 给 12 条样板音频生成元数据 (per file meta.json)。
 *
 * 每个 mp3 同目录写一份 meta.json:
 *   {
 *     "provider", "voice", "model", "speed", "instructions", "outputFormat",
 *     "sourceText", "generatedAt",
 *     "contentHash", "fileHash", "duration", "size",
 *     "generationStatus", "errorMessage"
 *   }
 *
 * 同时生成汇总 data/natural-audio-meta-12.json 便于 review 页读。
 *
 * 注: duration 估算:
 *   - 美式英语自然语速约 2.8 syllable/sec (基于平均 130-150 wpm)
 *   - 但实际 mp3 时长与 TTS 引擎、speed、停顿有关, 无法精准获取
 *   - 这里用 fileSize / 16KB·s (按 128kbps 估算) 给出近似值, 标记 estimate
 *
 * 运行: node tools/generate-audio-meta.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SAMPLES_FILE = path.join(ROOT, 'data', 'natural-samples-12.json');
const AUDIO_DIR = path.join(ROOT, 'audio', 'natural');
const SUMMARY_FILE = path.join(ROOT, 'data', 'natural-audio-meta-12.json');

const samplesData = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
const provider = samplesData.provider;
const samples = samplesData.samples;

const summary = {
  meta: {
    generatedAt: new Date().toISOString(),
    provider: provider.name,
    model: provider.model,
    outputFormat: provider.outputFormat,
    note: '阶段四 B 12 条样板, 24 个 mp3。duration 为按文件大小估算的近似值。',
  },
  totalSamples: samples.length,
  totalFiles: samples.length * 2,
  successCount: 0,
  failedCount: 0,
  totalSize: 0,
  totalDuration: 0,
  samples: [],
};

function estimateDurationFromFileSize(fileSize) {
  // 假设 128kbps mp3 (16KB/s)
  return +(fileSize / 16000).toFixed(2);
}

function estimateDurationFromText(text, speed) {
  // 估算美式英语自然语速 2.8 syllable/sec, speed 调整
  // 简化: 按字符数 / 12 (平均 12 字符/秒 @ speed=1)
  const baseCharsPerSec = 12;
  return +(text.length / (baseCharsPerSec * speed)).toFixed(2);
}

for (const s of samples) {
  const sampleEntry = {
    no: s.no,
    lessonId: s.lessonId,
    sentenceId: s.sentenceId,
    category: s.category,
    writtenText: s.writtenText,
    naturalText: s.naturalText,
    clearText: s.clearText,
    expectedChanges: s.expectedChanges,
    files: {},
  };

  for (const version of ['clear', 'natural']) {
    const relPath = path.join(AUDIO_DIR, s.lessonId, s.sentenceId, `${version}.mp3`);
    const metaRelPath = path.join(AUDIO_DIR, s.lessonId, s.sentenceId, `${version}.meta.json`);

    if (!fs.existsSync(relPath)) {
      const meta = {
        provider: provider.name,
        voice: version === 'clear' ? provider.clearVoice : provider.naturalVoice,
        model: provider.model,
        speed: version === 'clear' ? provider.clearSpeed : provider.naturalSpeed,
        instructions: version === 'clear' ? 'neutral American, deliberate pace, no IPA-driven compression' : 'casual American, IPA features realized via naturalText spelling compression',
        outputFormat: provider.outputFormat,
        sourceText: version === 'clear' ? s.clearText : s.naturalText,
        generatedAt: 'unknown',
        contentHash: crypto.createHash('sha256').update(version === 'clear' ? s.clearText : s.naturalText).digest('hex'),
        fileHash: null,
        duration: null,
        size: null,
        generationStatus: 'failed',
        errorMessage: 'mp3 file not found at expected path',
      };
      fs.writeFileSync(metaRelPath, JSON.stringify(meta, null, 2));
      sampleEntry.files[version] = { meta, relPath };
      summary.failedCount++;
      continue;
    }

    const buf = fs.readFileSync(relPath);
    const fileHash = crypto.createHash('sha256').update(buf).digest('hex');
    const size = buf.length;
    const duration = estimateDurationFromFileSize(size);
    const sourceText = version === 'clear' ? s.clearText : s.naturalText;

    const meta = {
      provider: provider.name,
      voice: version === 'clear' ? provider.clearVoice : provider.naturalVoice,
      model: provider.model,
      speed: version === 'clear' ? provider.clearSpeed : provider.naturalSpeed,
      instructions: version === 'clear'
        ? 'neutral American, deliberate pace, no IPA-driven compression'
        : 'casual American, IPA features realized via naturalText spelling compression (e.g. didja, wanna, lemme)',
      outputFormat: provider.outputFormat,
      sourceText,
      generatedAt: fs.statSync(relPath).mtime.toISOString(),
      contentHash: crypto.createHash('sha256').update(sourceText).digest('hex'),
      fileHash,
      duration,
      size,
      generationStatus: 'success',
      errorMessage: null,
    };

    fs.writeFileSync(metaRelPath, JSON.stringify(meta, null, 2));
    sampleEntry.files[version] = {
      relPath: path.relative(ROOT, relPath),
      metaRelPath: path.relative(ROOT, metaRelPath),
      meta,
    };
    summary.successCount++;
    summary.totalSize += size;
    summary.totalDuration += duration;
  }
  summary.samples.push(sampleEntry);
}

summary.avgSize = Math.round(summary.totalSize / summary.successCount);
summary.avgDuration = +(summary.totalDuration / summary.successCount).toFixed(2);
summary.totalSizeMB = +(summary.totalSize / 1048576).toFixed(3);

fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
console.log(`[meta] wrote ${SUMMARY_FILE}`);
console.log(`[meta] success: ${summary.successCount}/${summary.totalFiles}, total ${summary.totalSizeMB} MB, avg ${summary.avgSize} bytes/file, ~${summary.avgDuration}s/file`);
