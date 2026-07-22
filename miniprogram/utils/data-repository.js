// utils/data-repository.js — v2 统一数据访问层
//
// 阶段二职责：
//   - 加载核心 3000 词库 (ECDICT-based, CC-BY-SA 4.0)
//   - 暴露 query / filter / pick 接口给 page 使用
//   - 不写任何网络请求（v2 阶段二数据全部本地）
//
// 阶段三扩展：
//   - 加 user progress (wordProgress) 关联
//   - 加 interval-repetition 算法
//   - 加场景 / 句子 / 跟读记录
//
// 阶段八性能优化 (2026-07-20):
//   - _index() 拆成轻量 (meta) 和完整 (3000 词索引) 两步
//   - 轻量同步 (meta + 计数), 完整异步 (setTimeout(0))
//   - 避免 onLoad 首屏卡顿 (1MB 词库同步迭代 ~150-200ms)

const wordsCore = require('../data/words-core.js');

let _meta = null;
let _byId = null;
let _byText = null;
let _byLevel = null;
let _loaded = false;
let _indexing = false;
let _pendingCallbacks = [];

function _indexSync() {
  if (_meta) return;
  _meta = wordsCore.meta;
}

function _indexAsync() {
  if (_loaded || _indexing) return;
  _indexing = true;
  // setTimeout(0) 推到下一个 tick, 不阻塞当前 onLoad 渲染
  setTimeout(() => {
    try {
      _byId = Object.create(null);
      _byText = Object.create(null);
      _byLevel = Object.create(null);
      for (const w of wordsCore.words) {
        _byId[w.id] = w;
        _byText[w.word.toLowerCase()] = w;
        const arr = _byLevel[w.level] || (_byLevel[w.level] = []);
        arr.push(w);
      }
      _loaded = true;
    } finally {
      _indexing = false;
      const cbs = _pendingCallbacks;
      _pendingCallbacks = [];
      for (const cb of cbs) { try { cb(); } catch (e) {} }
    }
  }, 0);
}

function _index() {
  _indexSync();
  _indexAsync();
}

function _assertLoaded() {
  _index();
  // 允许 meta 立即可用, 完整词库异步加载
  if (!_meta) throw new Error('data-repository: meta load failed');
}

/**
 * 等待完整词库索引完成 (供今日训练等需要完整数据的场景使用)
 */
function whenReady() {
  return new Promise((resolve) => {
    if (_loaded) { resolve(true); return; }
    _pendingCallbacks.push(resolve);
    _indexAsync();
  });
}

// === Meta ===
function getMeta() {
  _assertLoaded();
  return _meta;
}

// === Basic queries ===
function getAllWords() {
  _assertLoaded();
  return wordsCore.words;
}

function getWordById(id) {
  _assertLoaded();
  return _byId[id] || null;
}

function getWordByText(text) {
  _assertLoaded();
  if (!text) return null;
  return _byText[text.toLowerCase()] || null;
}

function getWordsByLevel(level) {
  _assertLoaded();
  return _byLevel[level] || [];
}

function getWordsByFrequency(min, max) {
  _assertLoaded();
  return wordsCore.words.filter(w =>
    (min === undefined || w.frequency >= min) &&
    (max === undefined || w.frequency < max)
  );
}

function getAudioStats() {
  _assertLoaded();
  let ready = 0, missing = 0, readySpell = 0, readyChinese = 0;
  for (const w of wordsCore.words) {
    const s = w.audio.status;
    if (s === 'ready') ready++;
    else if (s === 'ready_spell') readySpell++;
    else if (s === 'ready_chinese') readyChinese++;
    else missing++;
  }
  return { total: wordsCore.words.length, ready, readySpell, readyChinese, missing };
}

// === Today batch picker (阶段二 MVP 简化版) ===
// 策略：每天从 level 1-3 抽 N 个 + 已学复习
// 阶段三会接 user progress + 间隔复习算法
function getTodayBatch(opts = {}) {
  const {
    size = 10,
    preferLevels = [1, 2, 3],
    learnedIds = [],          // 已学过的 word id 列表
    reviewCount = 0,          // 复习数量
  } = opts;

  _assertLoaded();

  // 1. 复习：从 learnedIds 里抽 reviewCount 个
  const reviewPool = learnedIds
    .map(id => _byId[id])
    .filter(Boolean);
  const review = _shuffle(reviewPool).slice(0, reviewCount);

  // 2. 新词：从 preferLevels 抽 size - reviewCount 个
  const newCount = Math.max(0, size - review.length);
  const newPool = [];
  for (const lv of preferLevels) {
    for (const w of (_byLevel[lv] || [])) {
      if (!learnedIds.includes(w.id)) newPool.push(w);
    }
  }
  const fresh = _shuffle(newPool).slice(0, newCount);

  return {
    date: _todayStr(),
    size: review.length + fresh.length,
    review,
    fresh,
    words: [...review, ...fresh],
  };
}

function _shuffle(arr) {
  // Fisher-Yates with Math.random — v2 阶段二够用
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// === Search (阶段二 MVP: 前缀匹配) ===
function searchWords(query, limit = 20) {
  _assertLoaded();
  if (!query) return [];
  const q = query.toLowerCase();
  const results = [];
  for (const w of wordsCore.words) {
    if (w.word.startsWith(q) || (w.meaning && w.meaning.includes(query))) {
      results.push(w);
      if (results.length >= limit) break;
    }
  }
  return results;
}

module.exports = {
  getMeta,
  getAllWords,
  getWordById,
  getWordByText,
  getWordsByLevel,
  getWordsByFrequency,
  getAudioStats,
  getTodayBatch,
  searchWords,
  whenReady,
  isReady() { return _loaded; },
  // 显式触发预加载 (异步, 推到下一个 tick)
  preload() { _index(); },
};
