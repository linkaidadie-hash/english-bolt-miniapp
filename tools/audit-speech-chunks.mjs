#!/usr/bin/env node
/**
 * tools/audit-speech-chunks.mjs
 *
 * 阶段四 B 修复 — 全量审计 180 句 speechChunks
 *
 * 检查项:
 *   1. chunks 拼接 (join(' ')) 必须等于 clearText (normalize 后)
 *   2. 每个 chunk 必须是完整词/缩写/自然意群 (启发式检测截断)
 *   3. chunks 不能为空字符串
 *   4. chunks 数 = speechChunks.length = audioSegmented.length
 *   5. audioSegmented[i].text 必须等于 speechChunks[i]
 *
 * 输出:
 *   - data/audit-speech-chunks.json (机器读)
 *   - data/audit-speech-chunks-summary.md (人读)
 *
 * 运行: node tools/audit-speech-chunks.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SENTENCES_FILE = path.join(ROOT, 'data', 'natural-sentences.json');
const REPORT_FILE = path.join(ROOT, 'data', 'audit-speech-chunks.json');
const SUMMARY_FILE = path.join(ROOT, 'data', 'audit-speech-chunks-summary.md');

// === 工具函数 ===

function normalize(s) {
  return s.replace(/\s+/g, ' ').trim();
}

const COMMON_TOKENS = new Set([
  'i', 'a', 'an', 'the', 'is', 'it', 'in', 'on', 'of', 'to', 'or', 'be', 'do', 'go', 'no', 'so', 'up', 'us', 'we', 'he', 'me', 'my',
  'at', 'as', 'by', 'am', 'if', 'oh', 'ok', 'hi', 'ya', 'ya.',
  "'m", "'s", "'t", "'d", "'ll", "'re", "'ve", "n't",
  'going', 'have', 'that', 'with', 'this', 'from', 'just', 'tell', 'want', 'some', 'much', 'good', 'nice', 'here', 'there', 'where', 'these', 'those',
  'can', 'did', 'had', 'has', 'her', 'him', 'his', 'how', 'its', 'let', 'may', 'new', 'old', 'our', 'own', 'say', 'see', 'she', 'the', 'too',
  'get', 'got', 'guy', 'job', 'lot', 'man', 'now', 'one', 'put', 'ran',
  'set', 'two', 'use', 'way', 'who', 'why', 'yet', 'you',
  'gimme', 'lemme', 'wanna', 'gonna', 'hafta', 'shoulda', 'woulda', 'coulda', 'mighta', 'musta', 'oughta', 'hasta',
  'betcha', 'whatcha', 'meetcha', 'gotcha', 'dunno', 'whatchamacallit', 'problemo',
  'don\'t', 'won\'t', 'can\'t', 'didn\'t', 'wouldn\'t', 'shouldn\'t', 'couldn\'t', 'mightn\'t',
  'haven\'t', 'hasn\'t', 'hadn\'t', 'aren\'t', 'isn\'t', 'wasn\'t', 'weren\'t',
  'i\'ll', 'you\'ll', 'we\'ll', 'they\'ll', 'i\'d', 'you\'d', 'we\'d', 'they\'d', 'i\'ve', 'you\'ve', 'we\'ve', 'they\'ve',
  'sir', 'ma\'am', 'okay', 'yeah', 'nope', 'yep', 'uh', 'um', 'huh',
  'it.', 'go.', 'me.', 'us.', 'so.', 'no.', 'the.', 'is.', 'am.', 'on.', 'in.', 'do.', 'no,', 'so,', 'ok,', 'oh,', 'hi,',
]);

// 启发式: 检测一个 chunk 字符串是否"被字符切分"或包含截断词
function isChunkBad(chunk) {
  const trimmed = chunk.trim();
  if (!trimmed) return { bad: true, reason: 'empty' };
  // rhythm 标注 (含 /) 跳过
  if (trimmed.includes('/')) return { bad: false, reason: 'rhythm' };
  const tokens = trimmed.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const clean = tok.replace(/[.,!?;:]+$/, '').toLowerCase();
    if (!clean) continue;
    if (COMMON_TOKENS.has(clean)) continue;
    if (clean.length === 1) continue;
    if (/^\d+$/.test(clean)) continue;
    if (/^[A-Z]/.test(tok) && clean.length <= 4) continue;  // 'I' 'Im'
    // 4 字母以下且不在白名单 + 非纯元音 → 可能是截断
    if (clean.length <= 3 && !/^[aeiou]+$/i.test(clean)) {
      return { bad: true, reason: `truncated_token:${tok}` };
    }
  }
  return { bad: false, reason: 'ok' };
}

function diffWords(a, b) {
  const aw = a.split(' '), bw = b.split(' ');
  const setA = new Set(aw), setB = new Set(bw);
  const onlyA = aw.filter(x => !setB.has(x));
  const onlyB = bw.filter(x => !setA.has(x));
  return { onlyInClear: onlyA, onlyInConcat: onlyB, clearLen: a.length, concatLen: b.length };
}

// === 主流程 ===

const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));

const anomalies = [];
let totalChecked = 0;
let concatOk = 0;
let chunkQualityOk = 0;
let nonEmptyOk = 0;
let lengthOk = 0;
let audioSegTextOk = 0;

for (const lesson of data.lessons) {
  for (const s of lesson.sentences) {
    totalChecked++;
    const issues = [];

    // 1. chunks 拼接 == clearText
    const concat = normalize((s.speechChunks || []).join(' '));
    const clear = normalize(s.clearText);
    if (concat !== clear) {
      issues.push({
        type: 'concat_mismatch',
        clearText: clear,
        concat,
        diff: diffWords(clear, concat),
      });
    } else {
      concatOk++;
    }

    // 2. 每个 chunk 是完整词/缩写/自然意群
    const badChunks = [];
    for (let i = 0; i < (s.speechChunks || []).length; i++) {
      const c = s.speechChunks[i];
      const r = isChunkBad(c);
      if (r.bad) badChunks.push({ chunkIndex: i, text: c, reason: r.reason });
    }
    if (badChunks.length > 0) {
      issues.push({ type: 'truncated_chunks', items: badChunks });
    } else {
      chunkQualityOk++;
    }

    // 3. chunks 非空
    if (!s.speechChunks || s.speechChunks.length === 0) {
      issues.push({ type: 'no_chunks' });
    } else {
      nonEmptyOk++;
    }

    // 4. 长度匹配
    if ((s.speechChunks || []).length !== (s.audioSegmented || []).length) {
      issues.push({
        type: 'length_mismatch',
        chunks: (s.speechChunks || []).length,
        audioSegmented: (s.audioSegmented || []).length,
      });
    } else {
      lengthOk++;
    }

    // 5. audioSegmented.text == chunks
    const segTextOk = (s.audioSegmented || []).every((seg, i) => seg.text === (s.speechChunks || [])[i]);
    if (!segTextOk) {
      issues.push({
        type: 'audioSegmented_text_mismatch',
        audioSegmented: (s.audioSegmented || []).map(a => a.text),
        speechChunks: s.speechChunks,
      });
    } else {
      audioSegTextOk++;
    }

    if (issues.length > 0) {
      anomalies.push({
        lessonId: lesson.id,
        sentenceId: s.id,
        clearText: clear,
        naturalText: s.naturalText,
        speechChunks: s.speechChunks,
        issues,
      });
    }
  }
}

// === 输出 ===

const report = {
  auditedAt: new Date().toISOString(),
  totalChecked,
  checks: { concatOk, chunkQualityOk, nonEmptyOk, lengthOk, audioSegTextOk },
  anomalyCount: anomalies.length,
  anomalies,
};
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

let md = `# speechChunks 审计报告 (${new Date().toISOString()})\n\n`;
md += `**总计**: ${totalChecked} 句 / **异常**: ${anomalies.length} 句\n\n`;
md += `## 检查项\n\n`;
md += `| # | 检查 | 通过 | 失败 |\n|---|---|---|---|\n`;
md += `| 1 | chunks 拼接 == clearText | ${concatOk} | ${totalChecked - concatOk} |\n`;
md += `| 2 | chunk 质量（无截断） | ${chunkQualityOk} | ${totalChecked - chunkQualityOk} |\n`;
md += `| 3 | chunks 非空 | ${nonEmptyOk} | ${totalChecked - nonEmptyOk} |\n`;
md += `| 4 | speechChunks.length == audioSegmented.length | ${lengthOk} | ${totalChecked - lengthOk} |\n`;
md += `| 5 | audioSegmented.text == chunks | ${audioSegTextOk} | ${totalChecked - audioSegTextOk} |\n\n`;

if (anomalies.length === 0) {
  md += `\n## ✅ 全部通过\n`;
} else {
  md += `\n## 异常详情 (${anomalies.length})\n\n`;
  for (const a of anomalies) {
    md += `### ${a.lessonId}/${a.sentenceId}\n\n`;
    md += `- clear: \`${a.clearText}\`\n`;
    md += `- natural: \`${a.naturalText}\`\n`;
    md += `- chunks: \`${JSON.stringify(a.speechChunks)}\`\n\n`;
    for (const iss of a.issues) {
      md += `- **${iss.type}**:\n`;
      if (iss.type === 'concat_mismatch') {
        md += `  - clearText: \`${iss.clearText}\`\n`;
        md += `  - concat: \`${iss.concat}\`\n`;
        md += `  - onlyInClear: ${JSON.stringify(iss.diff.onlyInClear)}\n`;
        md += `  - onlyInConcat: ${JSON.stringify(iss.diff.onlyInConcat)}\n`;
      } else if (iss.type === 'truncated_chunks') {
        for (const t of iss.items) {
          md += `  - chunk[${t.chunkIndex}]: \`${t.text}\` (${t.reason})\n`;
        }
      } else if (iss.type === 'length_mismatch') {
        md += `  - chunks.length=${iss.chunks}, audioSegmented.length=${iss.audioSegmented}\n`;
      } else if (iss.type === 'audioSegmented_text_mismatch') {
        md += `  - audioSegmented: ${JSON.stringify(iss.audioSegmented)}\n`;
        md += `  - speechChunks: ${JSON.stringify(iss.speechChunks)}\n`;
      } else {
        md += `  - ${JSON.stringify(iss)}\n`;
      }
    }
    md += `\n`;
  }
}
fs.writeFileSync(SUMMARY_FILE, md);

console.log(`[audit-chunks] ${totalChecked} sentences checked, ${anomalies.length} anomalies`);
console.log(`[audit-chunks] wrote ${REPORT_FILE}`);
console.log(`[audit-chunks] wrote ${SUMMARY_FILE}`);
