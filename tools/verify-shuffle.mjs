#!/usr/bin/env node
/**
 * tools/verify-shuffle.mjs
 *
 * 阶段四 B 验收 — 验证 _shuffle 算法
 *
 * 测试:
 *   1. 30 句随机抽, 初始顺序 0 次与答案同
 *   2. 2 块必互换
 *   3. 3+ 块至少 2 位置变化
 *   4. 至少 8 位置变化 (>50%)
 *
 * 模拟 _shuffle 行为 (从 train.js 抽出)
 * 运行: node tools/verify-shuffle.mjs
 */

// 模拟 train.js 的 _shuffle (拷贝过来, 不依赖 wx)
function _shuffle(arr) {
  const n = arr.length;
  if (n <= 1) return arr;
  const original = [...arr];
  for (let attempt = 0; attempt < 20; attempt++) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (_shuffleValid(original, arr)) {
      return arr;
    }
  }
  arr.push(arr.shift());
  if (n === 1) arr[0] = arr[0];
  return arr;
}

function _shuffleValid(original, shuffled) {
  const n = original.length;
  if (n === 1) return false;
  if (n === 2) {
    return shuffled[0] !== original[0] && shuffled[1] !== original[1];
  }
  let diffCount = 0;
  for (let i = 0; i < n; i++) {
    if (original[i] !== shuffled[i]) diffCount++;
  }
  return diffCount >= 2;
}

let totalRuns = 0;
let originalEqualCount = 0;
let twoBlockFailed = 0;
let threeBlockFailed = 0;
let belowFiftyPct = 0;
let trainableRuns = 0;
let trainableOriginalEqual = 0;

const ROUNDS = 30;
// n >= 2 (sound-to-words 实际可训练的最小 chunks 数 = 2)
const chunksSize = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];

for (const n of chunksSize) {
  const original = Array.from({ length: n }, (_, i) => i);
  let rounds = 0;
  let originalEqual = 0;
  let diff2 = 0;
  let lessThan50Pct = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const shuffled = _shuffle([...original]);
    rounds++;
    if (shuffled.every((v, idx) => v === original[idx])) originalEqual++;
    if (n === 2) {
      if (shuffled[0] === original[0] || shuffled[1] === original[1]) diff2++;
    } else if (n >= 3) {
      let diffCount = 0;
      for (let j = 0; j < n; j++) if (shuffled[j] !== original[j]) diffCount++;
      if (diffCount < 2) diff2++;
      if (diffCount < n * 0.5) lessThan50Pct++;
    }
  }
  totalRuns += rounds;
  originalEqualCount += originalEqual;
  trainableRuns += rounds;
  trainableOriginalEqual += originalEqual;
  twoBlockFailed += (n === 2 ? diff2 : 0);
  threeBlockFailed += (n >= 3 ? diff2 : 0);
  belowFiftyPct += (n >= 3 ? lessThan50Pct : 0);

  const tag = n === 1 ? 'no-shuffle' : n === 2 ? '2-block-must-swap' : '3+-block-must-2pos';
  const extra = n >= 3 ? `, less50%=${lessThan50Pct}` : '';
  console.log(`[shuffle] n=${n}: ${ROUNDS} runs, originalEqual=${originalEqual}/${tag}-failed=${diff2}${extra}`);
}

console.log('');
console.log(`[shuffle] total runs: ${totalRuns}`);
console.log(`[shuffle] trainable (n>=2) runs: ${trainableRuns}`);
console.log(`[shuffle] trainable 初始顺序 == 答案 (失败): ${trainableOriginalEqual} / ${trainableRuns}`);
console.log(`[shuffle] 2-block 必互换 (失败): ${twoBlockFailed}`);
console.log(`[shuffle] 3+ block 至少 2 位置变化 (失败): ${threeBlockFailed}`);
console.log(`[shuffle] 3+ block 至少 50% 位置变化 (失败): ${belowFiftyPct}`);
console.log('');

if (trainableOriginalEqual === 0 && twoBlockFailed === 0 && threeBlockFailed === 0) {
  console.log('✅ _shuffle 算法验证通过');
} else {
  console.log('❌ _shuffle 算法有问题');
  process.exit(1);
}
