#!/usr/bin/env python3
"""
tools/audit-vps.py — VPS 端 audio 全量 HEAD 验证（V2 阶段二前置）

在 109vps (ai-supervisor) 上跑，绕开本机 Windows 防火墙对 cn_* 前缀的拦截。
读 /var/www/english-trainer/audio/ 全部 .mp3，HEAD 测 https://english.wujiong.cn/audio/<name>
输出到 stdout JSONL + 写本地 /tmp/audio-audit-vps.jsonl

用法（在本地通过 ssh 跑）：
  ssh ai-supervisor "python3 /tmp/audit-vps.py"
  ssh ai-supervisor "cat /tmp/audio-audit-vps.jsonl" > data/audio-audit-vps.jsonl
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

AUDIO_DIR = Path('/var/www/english-trainer/audio')
AUDIO_BASE = 'https://english.wujiong.cn/audio/'
OUT_JSONL  = Path('/tmp/audio-audit-vps.jsonl')
CONCURRENCY = 32
TIMEOUT = 5

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE  # 自签证书常见，省事

def list_files():
    files = sorted(p.name for p in AUDIO_DIR.iterdir() if p.is_file() and p.suffix == '.mp3')
    print(f'[vps] listing {AUDIO_DIR} -> {len(files)} files', file=sys.stderr)
    return files

def probe(name):
    url = AUDIO_BASE + urllib.parse.quote(name)
    t0 = time.monotonic()
    try:
        req = urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
            return {
                'token': name, 'url': url,
                'status': r.status,
                'size': int(r.headers.get('content-length') or 0),
                'contentType': r.headers.get('content-type') or '',
                'durationMs': int((time.monotonic() - t0) * 1000),
            }
    except urllib.error.HTTPError as e:
        return {'token': name, 'url': url, 'status': e.code, 'size': 0, 'contentType': '', 'durationMs': int((time.monotonic() - t0) * 1000), 'error': str(e)}
    except Exception as e:
        return {'token': name, 'url': url, 'status': 0, 'size': 0, 'contentType': '', 'durationMs': int((time.monotonic() - t0) * 1000), 'error': repr(e)[:200]}

def main():
    files = list_files()
    out = OUT_JSONL.open('w', encoding='utf-8')
    counts = {200: 0, 404: 0, 403: 0, 0: 0, 'other': 0}
    total_bytes = 0
    t0 = time.monotonic()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futs = {ex.submit(probe, n): n for n in files}
        done = 0
        for fut in as_completed(futs):
            r = fut.result()
            out.write(json.dumps(r, ensure_ascii=False) + '\n')
            out.flush()
            done += 1
            if r['status'] == 200:
                counts[200] += 1
                total_bytes += r['size']
            elif r['status'] == 404:
                counts[404] += 1
            elif r['status'] == 403:
                counts[403] += 1
            elif r['status'] == 0:
                counts[0] += 1
            else:
                counts['other'] += 1
            if done % 200 == 0:
                elapsed = time.monotonic() - t0
                print(f'[vps] {done}/{len(files)} elapsed={elapsed:.1f}s', file=sys.stderr)
    out.close()
    print(f'[vps] DONE total={len(files)} status_counts={counts} total_bytes={total_bytes}', file=sys.stderr)
    print(f'[vps] wrote {OUT_JSONL}')

if __name__ == '__main__':
    main()
