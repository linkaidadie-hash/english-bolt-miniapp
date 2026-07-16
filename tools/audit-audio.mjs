#!/usr/bin/env node
/**
 * tools/audit-audio.mjs
 *
 * 探测 https://english.wujiong.cn/audio/ 下的 mp3 文件可用性。
 *
 * 用法：
 *   node tools/audit-audio.mjs --candidates candidates.txt
 *   node tools/audit-audio.mjs --candidates candidates.txt --concurrency 8
 *   node tools/audit-audio.mjs --probe-naming 20
 *
 * 输入 candidates.txt: 每行一个候选词（裸词，脚本自动加 .mp3 后缀）。
 * 输出：
 *   data/audio-audit.jsonl   每行 {word, url, status, size, contentType, durationMs}
 *   data/audio-audit.csv     同上 CSV 版
 *   控制台汇总：total / 200 / 404 / network_error
 *
 * 严格遵守红线（来自 user）：
 *   - 不用假占位；找不到的就是 missing，绝不写空文件
 *   - 复用现有 5855 个真实音频；这个脚本只用来"摸家底"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const AUDIO_BASE = 'https://english.wujiong.cn/audio/';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { candidates: null, filenames: null, concurrency: 8, probeNaming: 0, timeoutMs: 8000, encoding: 'utf8' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--candidates') out.candidates = args[++i];
    else if (a === '--filenames') out.filenames = args[++i];
    else if (a === '--encoding') out.encoding = args[++i];
    else if (a === '--concurrency') out.concurrency = Number(args[++i]) || 8;
    else if (a === '--probe-naming') out.probeNaming = Number(args[++i]) || 0;
    else if (a === '--timeout') out.timeoutMs = Number(args[++i]) || 8000;
  }
  return out;
}

function readText(p, encoding) {
  // 试 utf-8 / utf16le / latin1；按 BOM 优先
  const buf = fs.readFileSync(p);
  if (buf[0] === 0xFF && buf[1] === 0xFE) return buf.slice(2).toString('utf16le');
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.slice(3).toString('utf8');
  if (encoding === 'utf16le') return buf.toString('utf16le');
  return buf.toString(encoding);
}

function loadCandidates(opts) {
  if (opts.filenames) {
    // 直接读 .mp3 文件名列表（一行一个完整文件名，含 .mp3 后缀，保留原始大小写）
    const text = readText(opts.filenames, opts.encoding);
    return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  if (opts.candidates) {
    const text = readText(opts.candidates, opts.encoding);
    return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  if (opts.probeNaming > 0) {
    // 内置一份 Top-N 常用英文词表（来自 Oxford / COCA 高频 100）
    const TOP = [
      'the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at',
      'this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','what',
      'so','up','out','if','about','who','get','which','go','me','when','make','can','like','time','no','just','him','know','take',
      'people','into','year','your','good','some','could','them','see','other','than','then','now','look','only','come','its','over','think','also',
      'back','after','use','two','how','our','work','first','well','way','even','new','want','because','any','these','give','day','most','us',
      'is','are','was','were','been','being','am','has','had','said','get','got','made','take','took','go','went','see','saw','come','came',
      'apple','banana','computer','phone','book','water','food','house','car','friend',
    ];
    return TOP.slice(0, opts.probeNaming);
  }
  throw new Error('必须给 --candidates <file> 或 --probe-naming <N>');
}

async function probeOne(token, opts) {
  // token 可能是 word (拼接 .mp3) 或 完整 filename
  const isFilename = token.toLowerCase().endsWith('.mp3');
  const url = AUDIO_BASE + encodeURIComponent(isFilename ? token : token + '.mp3');
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const size = Number(res.headers.get('content-length') || 0);
    const ct = res.headers.get('content-type') || '';
    return { token, url, status: res.status, size, contentType: ct, durationMs: Date.now() - t0 };
  } catch (e) {
    return { token, url, status: 0, size: 0, contentType: '', durationMs: Date.now() - t0, error: String(e?.message || e) };
  }
}

async function runPool(items, fn, concurrency) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarize(results) {
  const s = { total: results.length, status200: 0, status404: 0, status403: 0, statusOther: 0, networkError: 0, totalBytes: 0 };
  for (const r of results) {
    if (r.status === 200) { s.status200++; s.totalBytes += r.size; }
    else if (r.status === 404) s.status404++;
    else if (r.status === 403) s.status403++;
    else if (r.status === 0) s.networkError++;
    else s.statusOther++;
  }
  return s;
}

function writeOutputs(results) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const jsonl = path.join(DATA_DIR, 'audio-audit.jsonl');
  fs.writeFileSync(jsonl, results.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  const csv = path.join(DATA_DIR, 'audio-audit.csv');
  const header = 'token,url,status,size,content_type,duration_ms,error';
  const lines = [header, ...results.map(r => [r.token, r.url, r.status, r.size, r.contentType, r.durationMs, r.error || ''].map(v => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(','))];
  fs.writeFileSync(csv, lines.join('\n') + '\n', 'utf8');
  return { jsonl, csv };
}

async function main() {
  const opts = parseArgs();
  const words = loadCandidates(opts);
  console.log(`[audit] tokens=${words.length} concurrency=${opts.concurrency} base=${AUDIO_BASE}`);
  const results = await runPool(words, w => probeOne(w, opts), opts.concurrency);
  const s = summarize(results);
  const files = writeOutputs(results);
  console.log('[audit] summary:', s);
  console.log('[audit] files:', files);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
