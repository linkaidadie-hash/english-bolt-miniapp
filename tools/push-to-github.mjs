// tools/push-to-github.mjs — 把 v2 项目 push 到新建 GitHub repo
//
// 用 Contents API (PUT /repos/{o}/r}/contents/{path})，不依赖 git 客户端。
// 绕过 Windows 网络 / 代理不稳，token 在内存使用，绝不 print。
//
// 用法：node tools/push-to-github.mjs
// 前置：
//   - vault [GITHUB].token 有效
//   - vault [GITHUB].repo_url 已知 owner (=linkaidadie-hash)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VAULT = 'C:\\Users\\Administrator\\.mavis\\vault\\secrets.env';

// === 读 vault 拿 token + owner ===
const text = fs.readFileSync(VAULT, 'utf8');
let cur = null; const sec = {};
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  if (line.startsWith('[') && line.endsWith(']')) { cur = line.slice(1, -1); sec[cur] = {}; continue; }
  if (cur && line.includes('=')) {
    const i = line.indexOf('=');
    sec[cur][line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}
const TOKEN = sec.GITHUB?.token;
const REPO_URL = sec.GITHUB?.repo_url || 'https://github.com/linkaidadie-hash/';
const OWNER = 'linkaidadie-hash';
const REPO = 'english-bolt-miniapp';

if (!TOKEN) { console.error('NO_TOKEN'); process.exit(1); }

// === 要 push 的文件清单（白名单：源代码 + 文档 + 关键数据） ===
// 显式列：不 push 过程 audit / 临时 ssh probe / _gh-list.mjs / _ecdict-*.py
const FILES = [
  // 根
  'README.md',
  '.gitignore',
  'project.config.json',
  'project.private.config.json',
  // 文档
  'docs/PROJECT-OUTLINE.md',
  'docs/PHASE1.md',
  'docs/PHASE1.5.md',
  'docs/PHASE2.md',
  'docs/PHASE3.md',
  'docs/PHASE4.md',
  'docs/AUDIT-natural-sentences.md',
  'docs/AUDIO-COST-12.md',
  // 阶段四 自然口语解码 — 数据
  'data/pronunciation-patterns.json',
  'data/natural-sentences.json',
  'data/natural-samples-12.json',
  'data/natural-audio-meta-12.json',
  'data/natural-audio-check-12.json',
  'data/natural-audio-backfill-12.json',
  'data/natural-audio-cost-12.json',
  'data/audit-natural-sentences.json',
  // 数据底层（v2 数据访问层）
  'data/audio-files.txt',
  'data/audio-vps-words.txt',
  'data/audio-vps-urls.json',
  'data/words-core.json',
  'data/extra-words.js',
  // 工具脚本
  'tools/audit-audio.mjs',
  'tools/audit-vps.py',
  'tools/build-data-js.mjs',
  'tools/build-word-list.mjs',
  'tools/gen-icons.mjs',
  'tools/audit-natural-sentences.mjs',
  'tools/natural-tts-provider.mjs',
  'tools/generate-audio-meta.mjs',
  'tools/check-natural-audio.mjs',
  'tools/backfill-natural-audio.mjs',
  'tools/calc-audio-cost.mjs',
  'tools/push-to-github.mjs',
  'tools/top100-words.txt',
  // 小程序源代码
  'miniprogram/app.js',
  'miniprogram/app.json',
  'miniprogram/app.wxss',
  'miniprogram/sitemap.json',
  'miniprogram/utils/tts.js',
  'miniprogram/utils/user-data.js',
  'miniprogram/utils/audio-cdn.js',
  'miniprogram/utils/data-repository.js',
  'miniprogram/utils/srs.js',
  'miniprogram/utils/trainer.js',
  'miniprogram/utils/natural-data.js',
  'miniprogram/data/words-core.js',
  'miniprogram/data/natural-sentences.js',
  'miniprogram/pages/today/today.js',
  'miniprogram/pages/today/today.wxml',
  'miniprogram/pages/today/today.wxss',
  'miniprogram/pages/today/today.json',
  'miniprogram/pages/immerse/immerse.js',
  'miniprogram/pages/immerse/immerse.wxml',
  'miniprogram/pages/immerse/immerse.wxss',
  'miniprogram/pages/immerse/immerse.json',
  'miniprogram/pages/scene/scene.js',
  'miniprogram/pages/scene/scene.wxml',
  'miniprogram/pages/scene/scene.wxss',
  'miniprogram/pages/scene/scene.json',
  'miniprogram/pages/mine/mine.js',
  'miniprogram/pages/mine/mine.wxml',
  'miniprogram/pages/mine/mine.wxss',
  'miniprogram/pages/mine/mine.json',
  'miniprogram/pages/listening/listening.js',
  'miniprogram/pages/listening/listening.wxml',
  'miniprogram/pages/listening/listening.wxss',
  'miniprogram/pages/listening/listening.json',
  'miniprogram/pages/spelling/spelling.js',
  'miniprogram/pages/spelling/spelling.wxml',
  'miniprogram/pages/spelling/spelling.wxss',
  'miniprogram/pages/spelling/spelling.json',
  'miniprogram/pages/review/review.js',
  'miniprogram/pages/review/review.wxml',
  'miniprogram/pages/review/review.wxss',
  'miniprogram/pages/review/review.json',
  // 阶段四 自然口语解码 — 页面
  'miniprogram/pages/natural/index.js',
  'miniprogram/pages/natural/index.wxml',
  'miniprogram/pages/natural/index.wxss',
  'miniprogram/pages/natural/index.json',
  'miniprogram/pages/natural/lesson.js',
  'miniprogram/pages/natural/lesson.wxml',
  'miniprogram/pages/natural/lesson.wxss',
  'miniprogram/pages/natural/lesson.json',
  'miniprogram/pages/natural/sample-review.js',
  'miniprogram/pages/natural/sample-review.wxml',
  'miniprogram/pages/natural/sample-review.wxss',
  'miniprogram/pages/natural/sample-review.json',
  'miniprogram/assets/tab/today-inactive.png',
  'miniprogram/assets/tab/today-active.png',
  'miniprogram/assets/tab/immerse-inactive.png',
  'miniprogram/assets/tab/immerse-active.png',
  'miniprogram/assets/tab/scene-inactive.png',
  'miniprogram/assets/tab/scene-active.png',
  'miniprogram/assets/tab/mine-inactive.png',
  'miniprogram/assets/tab/mine-active.png',
  // 阶段四 自然口语解码 — tab 图标
  'miniprogram/assets/tab/natural-inactive.png',
  'miniprogram/assets/tab/natural-active.png',
];

const GH_API = 'https://api.github.com';

async function gh(method, path, body) {
  const r = await fetch(`${GH_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'mavis-english-bolt',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: r.ok, status: r.status, data: json };
}

async function createRepo() {
  console.log(`[gh] creating repo ${OWNER}/${REPO} ...`);
  const r = await gh('POST', '/user/repos', {
    name: REPO,
    description: '英语快充 v2 - 微信小程序，大词库 + 自然口语解码 + 场景学习。v2 of english-trainer (PWA).',
    private: false,
    auto_init: true,
  });
  if (r.ok) {
    console.log(`[gh] repo created: ${r.data.html_url}`);
    return true;
  }
  if (r.status === 422 && JSON.stringify(r.data).includes('name already exists')) {
    console.log('[gh] repo already exists, continue');
    return true;
  }
  console.error('[gh] create repo failed', r.status, JSON.stringify(r.data).slice(0, 300));
  return false;
}

async function getFileSha(filePath) {
  const r = await gh('GET', `/repos/${OWNER}/${REPO}/contents/${encodeURI(filePath).replace(/^\//, '')}`);
  if (r.status === 404) return null;
  if (!r.ok) { console.error(`[gh] GET ${filePath} failed`, r.status); return null; }
  return r.data.sha;
}

async function putFile(filePath, contentBase64, sha) {
  const body = {
    message: sha ? `update ${filePath}` : `add ${filePath}`,
    content: contentBase64,
  };
  if (sha) body.sha = sha;
  const r = await gh('PUT', `/repos/${OWNER}/${REPO}/contents/${filePath}`, body);
  return r;
}

function toBase64(buffer) {
  return buffer.toString('base64');
}

async function main() {
  if (!await createRepo()) process.exit(1);
  // 等 2s 让 repo init 完
  await new Promise(r => setTimeout(r, 2000));

  let ok = 0, fail = 0, skip = 0;
  const updated = process.argv.includes('--only');
  for (const rel of FILES) {
    if (updated && ![
      'miniprogram/utils/user-data.js',
      'miniprogram/utils/srs.js',
      'miniprogram/utils/trainer.js',
      'miniprogram/pages/today/today.js',
      'miniprogram/pages/today/today.wxml',
      'miniprogram/pages/today/today.wxss',
      'miniprogram/pages/mine/mine.js',
      'miniprogram/pages/mine/mine.wxml',
      'miniprogram/pages/mine/mine.wxss',
      'miniprogram/pages/listening/listening.js',
      'miniprogram/pages/listening/listening.wxml',
      'miniprogram/pages/listening/listening.wxss',
      'miniprogram/pages/listening/listening.json',
      'miniprogram/pages/spelling/spelling.js',
      'miniprogram/pages/spelling/spelling.wxml',
      'miniprogram/pages/spelling/spelling.wxss',
      'miniprogram/pages/spelling/spelling.json',
      'miniprogram/pages/review/review.js',
      'miniprogram/pages/review/review.wxml',
      'miniprogram/pages/review/review.wxss',
      'miniprogram/pages/review/review.json',
      'docs/PHASE3.md',
    ].includes(rel)) continue;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.log(`[skip] ${rel} (not found)`);
      skip++;
      continue;
    }
    const buf = fs.readFileSync(abs);
    const b64 = toBase64(buf);
    // 1MB 限制保护
    if (buf.length > 100 * 1024 * 1024) {
      console.error(`[fail] ${rel} > 100MB`);
      fail++;
      continue;
    }
    const sha = await getFileSha(rel);
    const r = await putFile(rel, b64, sha);
    if (r.ok) {
      console.log(`[ok]   ${rel}  (${buf.length} bytes)`);
      ok++;
    } else {
      console.error(`[fail] ${rel}  ${r.status}  ${JSON.stringify(r.data).slice(0, 200)}`);
      fail++;
    }
    // 节流，避免触发 rate limit
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`\n[summary] ok=${ok} fail=${fail} skip=${skip} total=${FILES.length}`);
  console.log(`[repo]    https://github.com/${OWNER}/${REPO}`);
}

main().catch(e => { console.error(e); process.exit(1); });
