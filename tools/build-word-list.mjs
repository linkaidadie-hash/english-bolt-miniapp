#!/usr/bin/env node
/**
 * tools/build-word-list.mjs — 把 audio-200.json 转为 word list (供 v2 数据层使用)
 *
 * 输入: data/audio-200.json (status=200 命中的 token + url + size)
 * 输出:
 *   data/audio-200-words.txt  (每行一个 word, 去掉 .mp3 后缀, lowercase 规范化)
 *   data/audio-200-urls.json  ({[word]: {url, size, contentType}})
 *
 * 阶段二会拿 audio-200-urls.json 作为"已确认可播"音频清单。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, 'data', 'audio-audit-vps.jsonl');
const TAG = SRC.includes('vps') ? 'vps' : 'local';
const OUT_WORDS = path.join(ROOT, 'data', `audio-${TAG}-words.txt`);
const OUT_URLS  = path.join(ROOT, 'data', `audio-${TAG}-urls.json`);

const text = fs.readFileSync(SRC, 'utf8');
const lines = text.split('\n').filter(Boolean);
console.log(`[build] input: ${lines.length} jsonl lines from ${SRC}`);

const urls = {};
const words = [];
for (const line of lines) {
  const r = JSON.parse(line);
  if (r.status !== 200) continue;
  const w = r.token.replace(/\.mp3$/i, '').toLowerCase();
  urls[w] = { url: r.url, size: r.size, contentType: r.contentType };
  words.push(w);
}
words.sort();
const uniqueWords = [...new Set(words)];

fs.writeFileSync(OUT_WORDS, uniqueWords.join('\n') + '\n', 'utf8');
fs.writeFileSync(OUT_URLS, JSON.stringify(urls, null, 2), 'utf8');
console.log(`[build] output: ${uniqueWords.length} unique words -> ${OUT_WORDS}`);
console.log(`[build] output: ${Object.keys(urls).length} url entries -> ${OUT_URLS}`);
