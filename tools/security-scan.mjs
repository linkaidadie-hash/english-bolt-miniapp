#!/usr/bin/env node
/**
 * tools/security-scan.mjs — 仓库隐私 / 凭证 / 配置自检
 *
 * 设计目标 (user 2026-07-23 安全审计):
 *   1. 扫描误入仓库的 token / API key / 私钥 / 密码 / AppSecret
 *   2. 扫描硬编码绝对路径 (内网 / 主机名 / 用户名)
 *   3. 扫描关闭 TLS 校验的代码 (CERT_NONE / verify=False / InsecureRequestWarning)
 *   4. 微信 APPID 只作"公开标识"提示, 不误报为高危
 *
 * 用法:
 *   node tools/security-scan.mjs                  # 扫描工作树
 *   node tools/security-scan.mjs --git            # 同时扫 git 历史 (慢)
 *   node tools/security-scan.mjs --json           # 输出 JSON 报告
 *
 * 退出码:
 *   0 = 干净 / 只有 APPID 提示
 *   1 = 发现高危 (token/secret/私钥/硬编码敏感路径)
 *   2 = 工具自身错误
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const SCAN_GIT = args.has('--git');
const JSON_OUT = args.has('--json');

// === 1. 路径/文件过滤 ===
// SKIP_DIRS 是精确目录名匹配；SKIP_DIR_PATTERNS 是 glob-style 前缀
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'miniprogram_npm',
  'audio', '.opencode', '.idea', '.vscode',
  'tools/tmp_audio',
]);
const SKIP_DIR_PATTERNS = [
  /^tools\/_trash(_.*)?$/,   // tools/_trash, tools/_trash_20260718, ...
  /^miniprogram\/assets$/,   // 静态图片, 不会有源码类隐私
];
const SKIP_FILE_PATTERNS = [
  /^data\/_manifest_failures\.json$/,
  /^data\/_words_audio_failed\.json$/,
  /^data\/_natural_audio_failed\.json$/,
];

const SCAN_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.py', '.json', '.md', '.txt', '.yml', '.yaml', '.sh', '.ps1', '.env', '.gitignore']);
const SCAN_FILENAMES = new Set(['.gitignore', '.env', '.npmrc']);

// self-detection: 不扫自己 (扫描器代码本身就是"如何检测"的样例)
const SELF_SCAN_FILES = new Set([
  'tools/security-scan.mjs',
]);

// === 2. 误报白名单 ===
// 微信 APPID:  wx + 16 hex (e.g. wxb60dcb566e114268) — 公开标识, 非秘密
const WX_APPID_RE = /\bwx[0-9a-f]{16}\b/gi;
// 常见的 *示例* placeholder (官方文档/SDK demo):
const PLACEHOLDER_VALUES = [
  'your-token-here', 'your_appid', 'replace-me', 'changeme',
  'xxxxxxxxxxxxxxxx', '<your-token>', 'YOUR_TOKEN', 'PLACEHOLDER',
];
// vendor / 公共 demo 用的知名 fake token
const FAKE_TOKEN_VALUES = new Set([
  'ghp_example', 'ghp_xxxxxxxxxxxxxxxxxxxx',
  'sk-test-xxxx', 'sk-xxx', 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
]);

// === 3. 高危模式 (任一命中即报 high) ===
// 3.1 真实 token / secret 格式
const HIGH_PATTERNS = [
  { name: 'github-pat',        re: /\bghp_[A-Za-z0-9]{30,}\b/g,                       desc: 'GitHub Personal Access Token' },
  { name: 'github-fine',       re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g,              desc: 'GitHub Fine-grained PAT' },
  { name: 'github-oauth',      re: /\bgho_[A-Za-z0-9]{30,}\b/g,                       desc: 'GitHub OAuth Token' },
  { name: 'github-server',     re: /\bghs_[A-Za-z0-9]{30,}\b/g,                       desc: 'GitHub Server Token' },
  { name: 'github-user',       re: /\bghu_[A-Za-z0-9]{30,}\b/g,                       desc: 'GitHub User Token' },
  { name: 'github-refresh',    re: /\bghr_[A-Za-z0-9]{30,}\b/g,                       desc: 'GitHub Refresh Token' },
  { name: 'slack-bot',         re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,             desc: 'Slack token' },
  { name: 'aws-access-key',    re: /\bAKIA[0-9A-Z]{16}\b/g,                           desc: 'AWS Access Key ID' },
  { name: 'openai-sk',         re: /\bsk-[A-Za-z0-9]{20,}[A-Za-z0-9]{2,}\b/g,         desc: 'OpenAI API key (sk- prefix)' },
  { name: 'anthropic',         re: /\bsk-ant-[A-Za-z0-9-]{20,}\b/g,                   desc: 'Anthropic API key' },
  { name: 'google-api',        re: /\bAIza[0-9A-Za-z_-]{30,}\b/g,                     desc: 'Google API key' },
  { name: 'pem-private-key',   re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g, desc: 'PEM private key' },
  { name: 'bearer-in-code',    re: /(?:Bearer|Authorization)\s*[:=]\s*['"]?[A-Za-z0-9._~+/=-]{20,}/g, desc: 'Authorization header / Bearer token' },
];

// 3.2 AppSecret / 微信小程序 secret — 严格的格式 (32 字符)
const WX_SECRET_RE = /['"]\b(app(?:_?secret|secret))\b['"]\s*[:=]\s*['"]([a-f0-9]{32})['"]/gi;

// 3.3 硬编码绝对路径 (Windows 盘符 / 已知内网主机名 / IP)
const HIGH_PATH_PATTERNS = [
  { name: 'windows-user-home', re: /[A-Z]:\\Users\\[^"'\s\\]+/g, desc: 'Windows 绝对用户路径 (含用户名)' },
  { name: 'localhost-ip',      re: /\b(?:127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)\b/g, desc: '内网 / loopback IP' },
];

// === 4. 中危模式 (TLS 关闭 / 调试域名 / debug 端点) ===
const MEDIUM_PATTERNS = [
  { name: 'tls-cert-none',     re: /ssl\.CERT_NONE|CERT_NONE\b|verify\s*=\s*False|InsecureRequestWarning/g, desc: 'TLS 证书校验被关闭' },
  { name: 'check-hostname-false', re: /check_hostname\s*=\s*False/g, desc: 'TLS hostname 校验被关闭' },
  { name: 'hardcoded-host',    re: /\bai-supervisor\b|var\/www\/english-trainer/g, desc: '硬编码内网主机名 / 路径' },
  { name: 'debug-https',       re: /--insecure|-k\b.*curl|verify=False.*requests|disable_warnings.*InsecureRequest/g, desc: '调试 / 跳过 TLS 标志' },
];

// === 5. 文件级白名单 (避免误报) ===
// - .gitignore 自身: 经常出现 "localhost" 等关键词当注释
// - tools/audit-audio.mjs: 引用 wujiong.cn (公开 CDN, 已知)
// - docs/*.md: 文档可能讨论历史 host
// - data/audio-vps-urls.json: 已知 CDN, 不算生产 host 泄露
const FILE_SCAN_SKIP = new Set([
  '.gitignore',
  'docs/',
  'data/audio-vps-urls.json',
  'data/audio-files.txt',
  'data/audio-vps-words.txt',
  // tools/audit-audio.mjs: 公开 CDN, 已知
]);

// === 6. 扫描器 ===
function listTrackedFiles() {
  // 只扫会被 push 的文件: git 跟踪的文件 (不含未跟踪, 不含 .gitignore 排除的本地文件)
  // 这是隐私扫描的正确边界: 工作树里的本地临时脚本不算
  let out;
  try {
    out = execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    console.error('[scan] git ls-files failed:', e?.message || e);
    return [];
  }
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

function walk(dir, out = []) {
  // 备选: 走文件系统 (含未跟踪), 用于 --all 模式
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith('._')) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (e.isDirectory()) {
      if (rel.startsWith('.git') || rel === 'node_modules') continue;
      if (SKIP_DIR_PATTERNS.some(p => p.test(rel))) continue;
      walk(full, out);
    } else if (e.isFile()) {
      if (SKIP_FILE_PATTERNS.some(p => p.test(rel))) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (SCAN_EXTS.has(ext) || SCAN_FILENAMES.has(e.name)) {
        out.push(rel);
      }
    }
  }
  return out;
}

function shouldSkipFile(rel) {
  if (FILE_SCAN_SKIP.has(rel)) return true;
  for (const p of FILE_SCAN_SKIP) {
    if (p.endsWith('/') && rel.startsWith(p)) return true;
  }
  return false;
}

const PLACEHOLDER_RE = new RegExp(PLACEHOLDER_VALUES.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
const FAKE_TOKEN_SET = FAKE_TOKEN_VALUES;

function isLikelyPlaceholder(hit) {
  const ctx = hit.context || '';
  if (PLACEHOLDER_RE.test(ctx)) return true;
  for (const fake of FAKE_TOKEN_SET) if (ctx.includes(fake)) return true;
  // base64 / 全同字符 / 长度明显短
  if (hit.match && hit.match.length < 24) return true;
  return false;
}

function lineOf(text, idx) {
  let n = 1, last = 0;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) { n++; last = i + 1; }
  }
  return n;
}

function snippetOf(text, idx, len, radius = 30) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + len + radius);
  return text.slice(start, end).replace(/\n/g, ' ');
}

function lineStart(text, idx) {
  let start = idx;
  while (start > 0 && text.charCodeAt(start - 1) !== 10) start--;
  return start;
}

// 判断这一行是不是代码注释 (// JS, # Python/shell/yaml, <!-- html)
// 用于忽略"在注释里讨论禁用模式"造成的误报
function isCommentLine(text, idx, ext) {
  const ls = lineStart(text, idx);
  const line = text.slice(ls, text.indexOf('\n', ls) === -1 ? text.length : text.indexOf('\n', ls));
  const t = line.trimStart();
  const e = (ext || '').toLowerCase();
  // JS / TS / C / C++ / Java / Go / Rust
  if (['.js', '.mjs', '.cjs', '.ts'].includes(e)) {
    return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
  }
  // Python / shell / yaml / .env / .gitignore / .toml
  if (['.py', '.sh', '.bash', '.zsh', '.yml', '.yaml', '.env', '.gitignore'].includes(e)) {
    return t.startsWith('#');
  }
  // PowerShell
  if (e === '.ps1') return t.startsWith('#');
  // JSON 没有注释; md 没有行注释
  return false;
}

function scanText(rel, text) {
  const findings = [];
  const ext = path.extname(rel);
  // 标记 Python docstring / multi-line 字符串区域
  const skipRanges = computeSkipRanges(text, ext);
  const isInSkip = (idx) => skipRanges.some(([a, b]) => idx >= a && idx < b);

  const push = (severity, name, desc, match, idx) => {
    // 注释行 / docstring / 字符串字面量不报中危 (讨论"如何禁用"是合理的)
    if (severity === 'medium' && isInSkip(idx)) return;
    findings.push({
      severity, file: rel, name, desc,
      match,
      line: lineOf(text, idx),
      snippet: snippetOf(text, idx, match.length),
    });
  };

  for (const p of HIGH_PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text)) !== null) {
      const ctx = text.slice(Math.max(0, m.index - 20), Math.min(text.length, m.index + m[0].length + 20));
      if (isLikelyPlaceholder({ match: m[0], context: ctx })) continue;
      push('high', p.name, p.desc, m[0], m.index);
    }
  }
  // WX AppSecret
  WX_SECRET_RE.lastIndex = 0;
  let m;
  while ((m = WX_SECRET_RE.exec(text)) !== null) {
    push('high', 'wx-appsecret', '微信小程序 AppSecret (32 hex)', m[2], m.index);
  }
  // 高危路径
  for (const p of HIGH_PATH_PATTERNS) {
    p.re.lastIndex = 0;
    while ((m = p.re.exec(text)) !== null) {
      push('high', p.name, p.desc, m[0], m.index);
    }
  }
  // 中危
  if (!shouldSkipFile(rel)) {
    for (const p of MEDIUM_PATTERNS) {
      p.re.lastIndex = 0;
      while ((m = p.re.exec(text)) !== null) {
        push('medium', p.name, p.desc, m[0], m.index);
      }
    }
  }
  // APPID 提示 (info, 不算 finding)
  WX_APPID_RE.lastIndex = 0;
  while ((m = WX_APPID_RE.exec(text)) !== null) {
    findings.push({
      severity: 'info', file: rel, name: 'wx-appid', desc: '微信小程序 APPID (公开标识)',
      match: m[0], line: lineOf(text, m.index), snippet: snippetOf(text, m.index, m[0].length),
    });
  }
  return findings;
}

// 标记不需要扫描的字符区间: 行注释 + docstring/多行字符串
function computeSkipRanges(text, ext) {
  const ranges = [];
  const e = (ext || '').toLowerCase();
  // 行注释前缀
  const lineCommentPrefix = (() => {
    if (['.js', '.mjs', '.cjs', '.ts'].includes(e)) return '//';
    if (['.py', '.sh', '.bash', '.zsh', '.yml', '.yaml', '.env', '.gitignore'].includes(e)) return '#';
    if (e === '.ps1') return '#';
    return null;
  })();
  if (lineCommentPrefix) {
    const re = new RegExp('^\\s*' + (lineCommentPrefix === '//' ? '//' : '#') + '.*$', 'gm');
    let lm;
    while ((lm = re.exec(text)) !== null) {
      ranges.push([lm.index, lm.index + lm[0].length]);
    }
  }
  // Python / shell docstring: """...""" 或 '''...'''
  if (e === '.py') {
    const tq = /"""/g;
    let positions = [];
    let mm;
    while ((mm = tq.exec(text)) !== null) positions.push(mm.index);
    for (let i = 0; i + 1 < positions.length; i += 2) {
      ranges.push([positions[i], positions[i + 1] + 3]);
    }
    const sq = /'''/g;
    positions = [];
    while ((mm = sq.exec(text)) !== null) positions.push(mm.index);
    for (let i = 0; i + 1 < positions.length; i += 2) {
      ranges.push([positions[i], positions[i + 1] + 3]);
    }
  }
  // JS 多行注释 /* ... */
  if (['.js', '.mjs', '.cjs', '.ts'].includes(e)) {
    const re = /\/\*[\s\S]*?\*\//g;
    let mm;
    while ((mm = re.exec(text)) !== null) {
      ranges.push([mm.index, mm.index + mm[0].length]);
    }
  }
  return ranges;
}

function scanWorkingTree() {
  // 默认: 只扫 git 跟踪的文件 (排除本地未跟踪 + .gitignore 排除)
  // 想要"扫工作树全部"用 --all
  const all = args.has('--all') ? walk(ROOT) : listTrackedFiles();
  const findings = [];
  for (const rel of all) {
    const relNorm = rel.replace(/\\/g, '/');
    // 跳过扫描器自身 (self-detection 假阳性)
    if (SELF_SCAN_FILES.has(relNorm)) continue;
    const abs = path.join(ROOT, rel);
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    findings.push(...scanText(relNorm, text));
  }
  return findings;
}

function scanGitHistory() {
  // 用 git log -p 拉所有历史 blob, 走 stream + scan
  // 注意: 大仓库会很慢, 但只对修改过的文件做轻量扫
  const out = execFileSync('git', ['log', '-p', '--all', '--no-color', '--no-renames'], {
    cwd: ROOT, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8',
  });
  // 用 -- 切 commit, 找 file header
  const findings = [];
  const lines = out.split('\n');
  let curFile = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('+++ b/') || line.startsWith('--- a/')) {
      const m = line.match(/^[+]{3} b\/(.+)$/);
      if (m) curFile = m[1];
      continue;
    }
    if (!curFile) continue;
    if (line.startsWith('@@')) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      // 跳过扫描器自身
      if (SELF_SCAN_FILES.has(curFile)) continue;
      // 这是新加/改动的行
      const text = line.slice(1);
      for (const f of scanText(curFile, text + '\n')) {
        // 调整 line: git patch 行号不严格, 给个 hint
        f.gitSource = true;
        findings.push(f);
      }
    }
  }
  return findings;
}

function dedupe(findings) {
  const seen = new Set();
  const out = [];
  for (const f of findings) {
    const k = `${f.severity}|${f.file}|${f.line}|${f.name}|${f.match}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function report(findings) {
  const high = findings.filter(f => f.severity === 'high');
  const medium = findings.filter(f => f.severity === 'medium');
  const info = findings.filter(f => f.severity === 'info');

  if (JSON_OUT) {
    console.log(JSON.stringify({ high, medium, info, summary: { high: high.length, medium: medium.length, info: info.length } }, null, 2));
  } else {
    if (high.length === 0 && medium.length === 0) {
      console.log(`[scan] CLEAN  high=0 medium=0 info=${info.length} (APPID hints)`);
    } else {
      console.log(`[scan] high=${high.length} medium=${medium.length} info=${info.length}`);
      for (const f of [...high, ...medium]) {
        console.log(`  [${f.severity.toUpperCase()}] ${f.file}:${f.line}  ${f.name}  ${f.match}`);
        console.log(`            ${f.desc}`);
        console.log(`            ${f.snippet}`);
      }
    }
    if (info.length > 0 && info.length < 10) {
      console.log(`[scan] APPID 公开标识提示 (不算高危, 不会失败):`);
      for (const f of info) console.log(`  - ${f.file}:${f.line}  ${f.match}`);
    }
  }
  return { high: high.length, medium: medium.length };
}

try {
  let findings = scanWorkingTree();
  if (SCAN_GIT) {
    findings = findings.concat(scanGitHistory());
  }
  findings = dedupe(findings);
  const { high, medium } = report(findings);
  if (high > 0) process.exit(1);
  if (medium > 0) {
    console.error('[scan] medium severity findings present, please review.');
    process.exit(1);
  }
  process.exit(0);
} catch (e) {
  console.error('[scan] ERROR:', e?.stack || e?.message || e);
  process.exit(2);
}
