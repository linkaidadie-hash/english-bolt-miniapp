#!/usr/bin/env python3
"""
tools/audit-vps.py — 在远端 Linux 主机上对一组 HTTPS 音频 URL 做 HEAD 验证。

所有主机 / 路径 / 输出位置都从环境变量读取；任意一个缺失都立即报错退出。

必需的环境变量 (运行时注入, **不要** 在仓库里写默认值):
  VPS_AUDIO_DIR     — 本地要扫描的目录 (e.g. /var/www/<site>/audio)
  VPS_AUDIO_BASE    — 对外的 HTTPS base URL (e.g. https://<host>/audio/)
  VPS_AUDIT_OUT     — jsonl 输出路径 (e.g. /tmp/audio-audit.jsonl)

可选:
  VPS_AUDIT_CONCURRENCY   (default 16, 上限 64)
  VPS_AUDIT_TIMEOUT       (default 5 秒)

设计红线 (来自 user 2026-07-23):
  - 任何 env 缺失 → 立刻报错退出, 不用生产值兜底
  - 默认启用系统 TLS 证书校验, 不允许 CERT_NONE / check_hostname=False
  - 日志里禁止打印 token / 完整 auth URL / 私有凭据
  - 不硬编码任何主机别名 / 绝对路径 / 生产域名

用法 (在远端主机上):
  VPS_AUDIO_DIR=/var/www/<site>/audio \
  VPS_AUDIO_BASE=https://<host>/audio/ \
  VPS_AUDIT_OUT=/tmp/audio-audit.jsonl \
    python3 tools/audit-vps.py
"""
import os
import sys
import json
import time
import urllib.request
import urllib.error
import ssl
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


def _require_env(name):
    v = os.environ.get(name)
    if not v or not v.strip():
        print(f'[vps] FATAL: env {name} is required and must be non-empty', file=sys.stderr)
        sys.exit(2)
    return v.strip()


def _int_env(name, default, lo, hi):
    raw = os.environ.get(name)
    if raw is None or raw == '':
        return default
    try:
        v = int(raw)
    except ValueError:
        print(f'[vps] FATAL: env {name} must be int, got {raw!r}', file=sys.stderr)
        sys.exit(2)
    if v < lo or v > hi:
        print(f'[vps] FATAL: env {name}={v} out of range [{lo},{hi}]', file=sys.stderr)
        sys.exit(2)
    return v


# === 必须的运行时配置 (无默认值, 缺失即失败) ===
AUDIO_DIR = Path(_require_env('VPS_AUDIO_DIR'))
AUDIO_BASE = _require_env('VPS_AUDIO_BASE').rstrip('/') + '/'
OUT_JSONL = Path(_require_env('VPS_AUDIT_OUT'))

# 简单的 URL/路径合法性预检 (防止 env 配错/含 token)
if not AUDIO_BASE.startswith('https://'):
    print(f'[vps] FATAL: VPS_AUDIO_BASE must start with https:// (got scheme-prefix-stripped base)', file=sys.stderr)
    sys.exit(2)
if '@' in AUDIO_BASE:
    print('[vps] FATAL: VPS_AUDIO_BASE must not contain userinfo (@). Use anonymous HTTPS only.', file=sys.stderr)
    sys.exit(2)

CONCURRENCY = _int_env('VPS_AUDIT_CONCURRENCY', default=16, lo=1, hi=64)
TIMEOUT = _int_env('VPS_AUDIT_TIMEOUT', default=5, lo=1, hi=60)

# === TLS 配置: 使用系统默认证书校验, 不允许跳过 ===
# 不再创建 custom ctx / CERT_NONE / check_hostname=False.
# urllib.request.urlopen 在 https URL 上默认走 ssl.create_default_context().


def list_files():
    if not AUDIO_DIR.is_dir():
        print(f'[vps] FATAL: AUDIO_DIR is not a directory: {AUDIO_DIR}', file=sys.stderr)
        sys.exit(2)
    files = sorted(p.name for p in AUDIO_DIR.iterdir() if p.is_file() and p.suffix == '.mp3')
    print(f'[vps] listing {AUDIO_DIR} -> {len(files)} files', file=sys.stderr)
    return files


def probe(name):
    url = AUDIO_BASE + urllib.parse.quote(name)
    t0 = time.monotonic()
    try:
        req = urllib.request.Request(url, method='HEAD')
        # 不带任何 Authorization / Cookie 头, urlopen 不会自动注入
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return {
                'token': name, 'url': url,
                'status': r.status,
                'size': int(r.headers.get('content-length') or 0),
                'contentType': r.headers.get('content-type') or '',
                'durationMs': int((time.monotonic() - t0) * 1000),
            }
    except urllib.error.HTTPError as e:
        return {'token': name, 'url': url, 'status': e.code, 'size': 0, 'contentType': '', 'durationMs': int((time.monotonic() - t0) * 1000), 'error': str(e)}
    except urllib.error.URLError as e:
        # 含 SSL 错误 (CERTIFICATE_VERIFY_FAILED 等)
        reason = str(e.reason) if e.reason is not None else repr(e)
        return {'token': name, 'url': url, 'status': 0, 'size': 0, 'contentType': '', 'durationMs': int((time.monotonic() - t0) * 1000), 'error': reason[:200]}
    except Exception as e:
        return {'token': name, 'url': url, 'status': 0, 'size': 0, 'contentType': '', 'durationMs': int((time.monotonic() - t0) * 1000), 'error': repr(e)[:200]}


def main():
    files = list_files()
    if not files:
        print('[vps] no mp3 files found, nothing to do', file=sys.stderr)
        # 仍然写一个空的 jsonl, 方便下游 pipeline
        OUT_JSONL.parent.mkdir(parents=True, exist_ok=True)
        OUT_JSONL.write_text('', encoding='utf-8')
        return

    OUT_JSONL.parent.mkdir(parents=True, exist_ok=True)
    out = OUT_JSONL.open('w', encoding='utf-8')
    counts = {200: 0, 404: 0, 403: 0, 0: 0, 'other': 0}
    total_bytes = 0
    t0 = time.monotonic()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futs = {ex.submit(probe, n): n for n in files}
        done = 0
        for fut in as_completed(futs):
            r = fut.result()
            # 日志输出: 只打印 token + status, 不打印 url 也不打印 error (error 经常带 host 信息)
            # 完整 url 已经在 jsonl 里有
            out.write(json.dumps(r, ensure_ascii=False) + '\n')
            out.flush()
            done += 1
            s = r['status']
            if s == 200:
                counts[200] += 1
                total_bytes += r['size']
            elif s == 404:
                counts[404] += 1
            elif s == 403:
                counts[403] += 1
            elif s == 0:
                counts[0] += 1
            else:
                counts['other'] += 1
            if done % 200 == 0 or done == len(files):
                elapsed = time.monotonic() - t0
                print(f'[vps] {done}/{len(files)} elapsed={elapsed:.1f}s status200={counts[200]} status404={counts[404]} status0={counts[0]}', file=sys.stderr)
    out.close()
    print(f'[vps] DONE total={len(files)} status_counts={counts} total_bytes={total_bytes}', file=sys.stderr)
    print(f'[vps] wrote {OUT_JSONL}')


if __name__ == '__main__':
    main()
