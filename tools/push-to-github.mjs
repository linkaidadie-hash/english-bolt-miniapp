// tools/push-to-github.mjs — 把仓库 push 到 GitHub（用 Contents API，不依赖 git 客户端）
//
// 设计目标（user 2026-07-23 安全审计要求）：
//   - 不在仓库里硬编码任何本机路径 / 用户名 / vault 位置
//   - vault 路径从 MAVIS_VAULT_PATH 读；若未设，尝试从用户主目录拼接
//     $USERPROFILE/.mavis/vault/secrets.env (Windows) 或
//     $HOME/.mavis/vault/secrets.env (Unix)
//   - 也可以直接用 GITHUB_TOKEN + GITHUB_OWNER + GITHUB_REPO env，跳过 vault
//   - token 缺失时安全失败，绝不打印 token 内容
//   - 不在仓库里出现具体用户名；OWNER/REPO 可被环境变量覆盖
//
// 用法：
//   node tools/push-to-github.mjs
// 前置（任选其一）：
//   A) MAVIS_VAULT_PATH 指向 vault 文件，文件内 [GITHUB] 段含 token / repo_url
//   B) GITHUB_TOKEN + GITHUB_OWNER + GITHUB_REPO 直接设环境变量

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function defaultVaultPath() {
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE || os.homedir();
    return path.join(home, '.mavis', 'vault', 'secrets.env');
  }
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.mavis', 'vault', 'secrets.env');
}

function parseVault(text) {
  const sec = {};
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) { cur = line.slice(1, -1); sec[cur] = sec[cur] || {}; continue; }
    if (cur && line.includes('=')) {
      const i = line.indexOf('=');
      sec[cur][line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return sec;
}

// === 解析 token / owner / repo ===
let TOKEN = process.env.GITHUB_TOKEN || '';
let OWNER = process.env.GITHUB_OWNER || '';
let REPO  = process.env.GITHUB_REPO  || '';
let REPO_URL = process.env.GITHUB_REPO_URL || '';

if (!TOKEN) {
  // fallback 到 vault
  const vaultPath = process.env.MAVIS_VAULT_PATH || defaultVaultPath();
  if (fs.existsSync(vaultPath)) {
    try {
      const sec = parseVault(fs.readFileSync(vaultPath, 'utf8'));
      TOKEN = TOKEN || sec.GITHUB?.token || '';
      REPO_URL = REPO_URL || sec.GITHUB?.repo_url || '';
    } catch (e) {
      console.error('[gh] FATAL: failed to parse vault at', vaultPath, '-', e?.message || e);
      process.exit(2);
    }
  }
}

if (!TOKEN) {
  console.error('[gh] FATAL: no GITHUB_TOKEN (env) and no [GITHUB].token in vault. Set one of: GITHUB_TOKEN, MAVIS_VAULT_PATH.');
  process.exit(1);
}

// OWNER / REPO 优先 env；其次从 REPO_URL 解析；否则需要显式设置
if (!OWNER || !REPO) {
  if (REPO_URL) {
    try {
      const u = new URL(REPO_URL);
      // https://github.com/<owner>/<repo>(.git)?/
      const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      if (parts.length >= 2) {
        OWNER = OWNER || parts[0];
        REPO  = REPO  || parts[1].replace(/\.git$/, '');
      } else if (parts.length === 1) {
        // owner-only URL (e.g. https://github.com/<owner>/), require explicit GITHUB_REPO
        OWNER = OWNER || parts[0];
      }
    } catch (e) {
      console.error('[gh] FATAL: GITHUB_REPO_URL is not a valid URL:', REPO_URL);
      process.exit(1);
    }
  }
}

if (!OWNER || !REPO) {
  console.error('[gh] FATAL: GITHUB_OWNER and GITHUB_REPO required.');
  console.error('         Set them via env (GITHUB_OWNER, GITHUB_REPO)');
  console.error('         or via vault [GITHUB] section (repo_url must include /<owner>/<repo>)');
  process.exit(1);
}

// 不打印 token / 完整 REPO_URL（仅打印 owner/repo）

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
  'data/natural-audio-check-all.json',
  'data/natural-audio-check-fast.json',
  'data/natural-audio-backfill-all.json',
  'data/natural-segmented-batch-list.json',
  'data/natural-audio-backfill-segmented.json',
  'data/audit-speech-chunks.json',
  'data/audit-speech-chunks-summary.md',
  'data/fix-speech-chunks.json',
  'data/regen-segmented-batch-list.json',
  'data/regen-segmented-needed.json',
  'data/regen-segmented-backfill.json',
  'data/natural-segmented-check.json',
  // 数据底层（v2 数据访问层）
  'data/audio-files.txt',
  'data/audio-vps-words.txt',
  'data/audio-vps-urls.json',
  'data/words-core.json',
  'data/extra-words.js',
  // 工具脚本
  'tools/audit-audio.mjs',
  'tools/audit-vps.py',
  'tools/security-scan.mjs',
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
  'tools/check-natural-audio-all.mjs',
  'tools/check-natural-audio-fast.mjs',
  'tools/gen-part1-batch-list.mjs',
  'tools/backfill-natural-audio-all.mjs',
  'tools/backfill-natural-segmented.mjs',
  'tools/gen-part2-segmented-batch-list.mjs',
  'tools/audit-speech-chunks.mjs',
  'tools/fix-speech-chunks.mjs',
  'tools/regen-segmented.mjs',
  'tools/regen-segmented-backfill.mjs',
  'tools/check-natural-segmented.mjs',
  'tools/verify-shuffle.mjs',
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
  // 阶段四 B 训练模式 (1 generic + ?mode=)
  'miniprogram/pages/natural/train.js',
  'miniprogram/pages/natural/train.wxml',
  'miniprogram/pages/natural/train.wxss',
  'miniprogram/pages/natural/train.json',
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

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function gh(method, path, body) {
  // 简单重试: 指数退避 3 次, 仅对 transient (fetch 异常 / 5xx) 重试
  // 401/403 立即终止, 不重试 (P0 2026-07-23 Vocora 401 调查结论: 不能用 retry 掩盖认证失败)
  const url = `${GH_API}${path}`;
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'mavis-english-bolt',
  };
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, init);
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      if (r.status === 401 || r.status === 403) {
        // 401/403 立即终止, 输出不含 Token 的认证阶段诊断
        // 不重试! 重试只会让认证失败被指数退避掩盖
        const tokenFp = TOKEN ? sha256Short(TOKEN) : '(none)';
        const tokenSrc = tokenSource();
        const diag = {
          request: { method, url, userAgent: headers['User-Agent'] },
          auth: { token_source: tokenSrc, token_fingerprint: tokenFp, token_present: !!TOKEN, auth_header_set: !!headers['Authorization'] },
          resolved: { owner: OWNER, repo: REPO },
          response: { status: r.status, body_excerpt: text.slice(0, 400) },
          hint: '运行 `node tools/push-to-github.mjs inspect` 单独验证 Token 是否有效. 如果 inspect 返回 200, 说明原 push 时网络/TLS 异常; 如果 inspect 也 401, 说明 Token 失效, 需在 GitHub Settings > Developer settings 重新签发.',
        };
        process.stderr.write(`[gh] FATAL 401/403 — 立即终止, 不重试\n${JSON.stringify(diag, null, 2)}\n`);
        return { ok: false, status: r.status, data: json, _fatal: true };
      }
      if (r.status === 429) {
        // rate limit, 尊重 Retry-After header
        const retryAfter = parseInt(r.headers.get('Retry-After') || '5', 10);
        if (attempt < 2) {
          process.stderr.write(`[gh] 429 rate limit, retry after ${retryAfter}s\n`);
          await sleep(Math.min(retryAfter, 30) * 1000);
          continue;
        }
        return { ok: false, status: 429, data: json };
      }
      if (r.status >= 500 && attempt < 2) {
        // 5xx transient, 重试
        await sleep(800 * (1 << attempt));
        continue;
      }
      return { ok: r.ok, status: r.status, data: json };
    } catch (e) {
      lastErr = e;
      // fetch failed (network blip / DNS / etc), 重试
      if (attempt < 2) {
        await sleep(800 * (1 << attempt));
        continue;
      }
    }
  }
  return { ok: false, status: 0, data: lastErr ? String(lastErr?.message || lastErr) : 'fetch failed (retried)' };
}

// 诊断 helper: 不打印 token, 只输出 sha256(token)[:8]
import { createHash } from 'node:crypto';
function sha256Short(s) {
  return createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
}

// 诊断 helper: 报告 token 来源
function tokenSource() {
  if (process.env.GITHUB_TOKEN) return 'env:GITHUB_TOKEN';
  if (process.env.MAVIS_VAULT_PATH) return `vault:${process.env.MAVIS_VAULT_PATH}`;
  if (process.platform === 'win32') return 'vault-default:<USERPROFILE>/.mavis/vault/secrets.env';
  return 'vault-default:$HOME/.mavis/vault/secrets.env';
}

// inspect 子命令: 单独调用 GitHub API 验证 token 有效性 (不重试, 不带 body)
//   用法: node tools/push-to-github.mjs inspect
//   退出码 0 = token 有效; 1 = 401/403; 2 = 其他错误
async function inspectToken() {
  if (!TOKEN) { console.error('[inspect] no token'); process.exit(2); }
  const url = `${GH_API}/user`;
  const r = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'mavis-english-bolt-inspect',
    },
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch {}
  if (r.status === 200) {
    console.log(JSON.stringify({
      status: 'ok',
      login: json?.login,
      id: json?.id,
      name: json?.name,
      scopes: json?.scopes ?? 'unknown (fine-grained PAT may not report)',
      token_source: tokenSource(),
      token_fingerprint: sha256Short(TOKEN),
    }, null, 2));
    process.exit(0);
  } else {
    console.log(JSON.stringify({
      status: 'fail',
      http_status: r.status,
      body_excerpt: text.slice(0, 300),
      token_source: tokenSource(),
      token_fingerprint: sha256Short(TOKEN),
    }, null, 2));
    process.exit(1);
  }
}

async function createRepo() {
  console.log(`[gh] creating repo ${OWNER}/${REPO} ...`);
  const r = await gh('POST', '/user/repos', {
    name: REPO,
    description: 'Vocora - 微信小程序，大词库 + 自然口语解码 + 场景学习。v2 of english-trainer (PWA).',
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
  // 子命令: inspect — 单独验证 token 有效性 (不重试, 不带 body)
  //   P0 2026-07-23 Vocora 401 调查: 用户跑这个能区分"Token 失效"和"网络异常"
  if (process.argv.includes('inspect')) {
    await inspectToken();
    return;
  }
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
      // P0 2026-07-23: 401/403 立即终止整个 push, 不允许继续触发
      if (r._fatal) {
        console.error(`[push] FATAL 401/403 detected, 立即停止 push. 剩余 ${FILES.length - ok - fail - skip} 个文件未推送.`);
        process.exit(1);
      }
    }
    // 节流，避免触发 rate limit
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`\n[summary] ok=${ok} fail=${fail} skip=${skip} total=${FILES.length}`);
  console.log(`[repo]    https://github.com/${OWNER}/${REPO}`);
}

main().catch(e => { console.error(e); process.exit(1); });
