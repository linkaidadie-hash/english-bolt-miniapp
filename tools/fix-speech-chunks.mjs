#!/usr/bin/env node
/**
 * tools/fix-speech-chunks.mjs
 *
 * 阶段四 B 修复 — 修正 61 句 concat_mismatch + 重建 audioSegmented 框架
 *
 * 修复规则:
 *   A. flap 句子: 字符切分 → 整词或词切
 *   B. rhythm 句子: clearText 移除 "/" 标注 + chunks 不变 (但重新生成 TTS 文本)
 *   C. informal 句子: chunks 改为 clearText 拆词 (wanna → "want to" 等)
 *   D. lk-12 / elision 3 / stress 1: 单字字符切分 → 整词
 *
 * 不重生成 TTS — 只改 data layer, TTS 后续用 tools/regen-segmented.mjs
 *
 * 运行: node tools/fix-speech-chunks.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const SENTENCES_JS = path.join(ROOT, 'miniprogram', 'data', 'natural-sentences.js');
const REPORT_FILE = path.join(ROOT, 'data', 'fix-speech-chunks.json');

// === 修复映射表 ===
// 格式: sentenceId -> { newClearText?, newChunks: [...] }
const FIX_MAP = {
  // === A. flap 句子: 字符切分 → 整词/词切 ===
  'fl-01': { newChunks: ['Water'] },
  'fl-02': { newChunks: ['Better'] },
  'fl-03': { newChunks: ['Pretty'] },
  'fl-04': { newChunks: ['Get', 'it'] },
  'fl-05': { newChunks: ['City'] },
  'fl-06': { newChunks: ['Letter'] },
  'fl-07': { newChunks: ['Matter'] },
  'fl-08': { newChunks: ['Little'] },
  'fl-09': { newChunks: ['Bottle'] },
  'fl-10': { newChunks: ['Title'] },
  'fl-11': { newChunks: ['Forty'] },
  'fl-12': { newChunks: ['Saturday'] },
  'fl-13': { newChunks: ['Not', 'at', 'all'] },
  'fl-14': { newChunks: ['Put', 'it', 'down'] },
  'fl-15': { newChunks: ['I\'m', 'going', 'to'] },
  'fl-16': { newChunks: ['Bet', 'you'] },
  'fl-17': { newChunks: ['I', 'gotta', 'go'] },
  'fl-18': { newChunks: ['Don\'t', 'forget'] },
  'fl-19': { newChunks: ['Right', 'there'] },
  'fl-20': { newChunks: ['What', 'time', 'is', 'it'] },

  // === B. rhythm 句子: clearText 移除 / 标注, chunks 改为对应意群 (无 /) ===
  'rh-01': { newClearText: 'I need to talk to him about it', newChunks: ['I need to', 'talk to him', 'about it'] },
  'rh-02': { newClearText: 'Give me a cup of coffee', newChunks: ['Give me', 'a cup of', 'coffee'] },
  'rh-03': { newClearText: 'Take it to the office', newChunks: ['Take it', 'to the', 'office'] },
  'rh-04': { newClearText: 'Look at this picture', newChunks: ['Look at', 'this picture'] },
  'rh-05': { newClearText: 'Tell me what you think', newChunks: ['Tell me', 'what you', 'think'] },
  'rh-06': { newClearText: 'I went to the store yesterday', newChunks: ['I went to the store', 'yesterday'] },
  'rh-07': { newClearText: 'He\'s working on a new project', newChunks: ['He\'s working', 'on a new', 'project'] },
  'rh-08': { newClearText: 'I want to be a doctor', newChunks: ['I want to be a', 'doctor'] },
  'rh-09': { newClearText: 'She\'s from a small town', newChunks: ['She\'s from', 'a small', 'town'] },
  'rh-10': { newClearText: 'I\'ll meet you at the airport', newChunks: ['I\'ll meet you', 'at the', 'airport'] },
  'rh-11': { newClearText: 'We had a great time', newChunks: ['We had a', 'great', 'time'] },
  'rh-12': { newClearText: 'I\'m looking for a new job', newChunks: ['I\'m looking', 'for a new', 'job'] },
  'rh-13': { newClearText: 'I just got back from vacation', newChunks: ['I just', 'got back', 'from vacation'] },
  'rh-14': { newClearText: 'They live in a big house', newChunks: ['They live in', 'a big', 'house'] },
  'rh-15': { newClearText: 'I read a book last night', newChunks: ['I read a book', 'last night'] },
  'rh-16': { newClearText: 'She plays the piano very well', newChunks: ['She plays the piano', 'very well'] },
  'rh-17': { newClearText: 'I want some ice cream', newChunks: ['I want', 'some', 'ice cream'] },
  'rh-18': { newClearText: 'He works at a bank', newChunks: ['He works', 'at a', 'bank'] },
  'rh-19': { newClearText: 'I\'m going to the movies', newChunks: ['I\'m going to the', 'movies'] },
  'rh-20': { newClearText: 'I\'ll see you on Monday', newChunks: ['I\'ll see you', 'on Monday'] },

  // === C. informal 句子: chunks 改为 clearText 拆词 (含 want to/going to 等) ===
  'if-01': { newClearText: 'I want to go', newChunks: ['I', 'want to', 'go'] },
  'if-02': { newClearText: 'I\'m going to tell him', newChunks: ['I\'m', 'going to', 'tell him'] },
  'if-03': { newClearText: 'I have to work', newChunks: ['I', 'have to', 'work'] },
  'if-04': { newClearText: 'Let me see', newChunks: ['Let me', 'see'] },
  'if-05': { newClearText: 'Give me that', newChunks: ['Give me', 'that'] },
  'if-06': { newClearText: 'What are you doing', newChunks: ['What are you', 'doing'] },
  'if-07': { newClearText: 'Do you know what', newChunks: ['Do you', 'know what'] },
  'if-08': { newClearText: 'Got you', newChunks: ['Got you'] },
  'if-09': { newClearText: 'I don\'t know', newChunks: ['I', 'don\'t', 'know'] },
  'if-10': { newClearText: 'Could you help me', newChunks: ['Could you', 'help me'] },
  'if-11': { newClearText: 'What are you going to do', newChunks: ['What are you', 'going to', 'do'] },
  'if-12': { newClearText: 'You all come back', newChunks: ['You all', 'come back'] },
  'if-13': { newClearText: 'What you may call it', newChunks: ['What you may call it'] },
  'if-14': { newClearText: 'You got it', newChunks: ['You', 'got it'] },
  'if-15': { newClearText: 'No problem', newChunks: ['No', 'problem'] },
  'if-16': { newClearText: 'I have got to run', newChunks: ['I', 'have got to', 'run'] },
  'if-17': { newClearText: 'See you later', newChunks: ['See you', 'later'] },
  'if-18': { newClearText: 'Take it easy', newChunks: ['Take it', 'easy'] },
  'if-19': { newClearText: 'What is up', newChunks: ['What is up'] },
  'if-20': { newClearText: 'I said', newChunks: ['I', 'said'] },

  // === D. 杂项 ===
  'lk-12': { newChunks: ['Far', 'away'] },
  'el-03': { newChunks: ['Friendship'] },
  'el-06': { newChunks: ['Handsome'] },
  'st-13': { newChunks: ['We', 'leave', 'tomorrow'] },
};

const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));
const report = { fixedAt: new Date().toISOString(), applied: [], skipped: [] };

for (const lesson of data.lessons) {
  for (const s of lesson.sentences) {
    const fix = FIX_MAP[s.id];
    if (!fix) continue;

    // 1. 改 clearText
    if (fix.newClearText) {
      s.clearText = fix.newClearText;
    }

    // 2. 改 chunks
    const newChunks = fix.newChunks;
    s.speechChunks = newChunks;

    // 3. 重建 audioSegmented (重置为 pending, TTS 后续跑)
    //    text 同步, 但 status 全部 missing 让 regen-segmented 重生
    s.audioSegmented = newChunks.map((text, i) => ({
      chunkIndex: i,
      text,
      clearText: text,
      naturalText: text,  // 用同样文本, natural 自然语速整体
      clearUrl: null,
      naturalUrl: null,
      clearStatus: 'pending',
      naturalStatus: 'pending',
      clearDuration: null,
      naturalDuration: null,
    }));

    // 4. 同步清掉全量 audio (chunk 数变了, 老 mp3 路径不再对)
    //    保留 audioClear/audioNatural 不动 (整句不变, audio 自然段不变)
    //    但 audioSegmented 全部 pending, 表示需要重生成

    report.applied.push({
      lessonId: lesson.id,
      sentenceId: s.id,
      newClearText: s.clearText,
      newChunks: newChunks,
      audioSegmentedCount: s.audioSegmented.length,
    });
  }
}

// 写 sentences.json
fs.writeFileSync(SENTENCES_FILE, JSON.stringify(data, null, 2));

// 写 inline require
const wrapped = `// Auto-generated from data/natural-sentences.json\n// Phase 4B — chunks fixed: ${report.applied.length} sentences updated\n// Generated at: ${new Date().toISOString()}\n\nmodule.exports = ${JSON.stringify(data)};\n`;
fs.writeFileSync(SENTENCES_JS, wrapped);

// 写 report
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

console.log(`[fix-chunks] applied: ${report.applied.length}`);
console.log(`[fix-chunks] wrote ${SENTENCES_FILE}`);
console.log(`[fix-chunks] wrote ${SENTENCES_JS}`);
console.log(`[fix-chunks] wrote ${REPORT_FILE}`);
console.log('');
console.log('Need to regen audioSegmented for:');
for (const a of report.applied) {
  console.log(`  ${a.lessonId}/${a.sentenceId}: ${a.audioSegmentedCount} chunks`);
}
