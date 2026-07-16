#!/usr/bin/env node
/**
 * tools/gen-icons.mjs
 *
 * 生成 4 个 tabBar 图标 (81x81 PNG, RGBA) + 选中/未选中两套。
 * 不依赖任何 npm 包，纯 Node 内置 zlib + Buffer。
 * 阶段一目标：让 app.json tabBar 跑通，icon 视觉够用即可。
 * 阶段二可换成 designer 出的真图标。
 */

import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'miniprogram', 'assets', 'tab');
mkdirSync(OUT_DIR, { recursive: true });

// 调色板
const C = {
  inactive: { r: 153, g: 153, b: 153 }, // #999999
  active:   { r:  74, g: 144, b: 226 }, // #4A90E2
};

// 像素图函数：在 (W,H) 画布上，对每个像素调用 fn(x,y) -> [r,g,b,a] 或 null=透明
function rasterize(W, H, fn) {
  const row = W * 4;
  const raw = Buffer.alloc((row + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (row + 1)] = 0; // filter None
    for (let x = 0; x < W; x++) {
      const px = fn(x, y);
      const off = y * (row + 1) + 1 + x * 4;
      if (px === null) {
        raw[off] = 0; raw[off+1] = 0; raw[off+2] = 0; raw[off+3] = 0;
      } else {
        raw[off] = px[0]; raw[off+1] = px[1]; raw[off+2] = px[2]; raw[off+3] = px[3] ?? 255;
      }
    }
  }
  return raw;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, c]);
}

function pngFromRaw(W, H, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makePng(W, H, fn) {
  return pngFromRaw(W, H, rasterize(W, H, fn));
}

// 图形原语
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx*dx + dy*dy <= r*r;
}
function inRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}
function inRing(x, y, cx, cy, rOut, rIn) {
  const d2 = (x-cx)*(x-cx) + (y-cy)*(y-cy);
  return d2 <= rOut*rOut && d2 >= rIn*rIn;
}

// 图标定义：每个 tab 一个 draw(color) 函数
const icons = {
  today: (col) => {
    // 中心实心圆 (任务点) + 外环 (今日计划)
    return (x, y) => {
      const c = { r: col.r, g: col.g, b: col.b, a: 255 };
      if (inCircle(x, y, 40.5, 40.5, 6)) return [c.r, c.g, c.b, 255];
      if (inRing(x, y, 40.5, 40.5, 22, 18)) return [c.r, c.g, c.b, 230];
      // 中心一条横线（今日）
      if (inRect(x, y, 28, 56, 53, 60)) return [c.r, c.g, c.b, 200];
      return null;
    };
  },
  immerse: (col) => {
    // 三条横线 (声波)
    return (x, y) => {
      const widths = [22, 32, 22];
      const yc = [26, 40, 54];
      for (let i = 0; i < 3; i++) {
        if (inRect(x, y, 40.5 - widths[i]/2, yc[i] - 3, 40.5 + widths[i]/2, yc[i] + 3)) {
          return [col.r, col.g, col.b, 255];
        }
      }
      return null;
    };
  },
  scene: (col) => {
    // 嵌套方块 (场景/分类)
    return (x, y) => {
      if (inRect(x, y, 18, 18, 63, 63)) {
        // 外框：中心掏空
        if (inRect(x, y, 22, 22, 59, 59)) return null;
        return [col.r, col.g, col.b, 255];
      }
      // 内点
      if (inRect(x, y, 36, 36, 45, 45)) return [col.r, col.g, col.b, 255];
      return null;
    };
  },
  mine: (col) => {
    // 简化人形 (圆头 + 身)
    return (x, y) => {
      // 头
      if (inCircle(x, y, 40.5, 28, 9)) return [col.r, col.g, col.b, 255];
      // 身（梯形）
      if (y >= 42 && y <= 64) {
        const t = (y - 42) / 22;
        const w = 14 + t * 12;
        if (Math.abs(x - 40.5) <= w) return [col.r, col.g, col.b, 255];
      }
      return null;
    };
  },
  natural: (col) => {
    // 圆形声波图标 (3 个高低不同的竖条 + 外环) — 代表"自然口语"音频训练
    return (x, y) => {
      // 外环（细线圆框）
      if (inRing(x, y, 40.5, 40.5, 36, 33)) return [col.r, col.g, col.b, 240];
      // 3 个竖条 (高低不同)
      const bars = [
        { x: 28, w: 6, y0: 34, y1: 48 },  // 矮
        { x: 37, w: 6, y0: 24, y1: 58 },  // 高
        { x: 46, w: 6, y0: 30, y1: 52 },  // 中
      ];
      for (const b of bars) {
        if (inRect(x, y, b.x, b.y0, b.x + b.w, b.y1)) return [col.r, col.g, col.b, 255];
      }
      return null;
    };
  },
};

for (const [name, draw] of Object.entries(icons)) {
  for (const [state, col] of [['inactive', C.inactive], ['active', C.active]]) {
    const W = 81, H = 81;
    const buf = makePng(W, H, draw(col));
    const out = path.join(OUT_DIR, `${name}-${state}.png`);
    writeFileSync(out, buf);
    console.log(`[icon] ${out}  ${buf.length} bytes`);
  }
}
console.log('[icon] done');
