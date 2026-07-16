// utils/user-data.js — v2 用户数据仓库
//
// 阶段三扩展：
//   - 5 维度进度（认识 / 拼写 / 标准听力 / 自然听力 / 会说）
//     其中 naturalListen 阶段四才填（缺音频）但保留字段
//   - 每词 entry: { firstAt, lastAt, exposure, recall, spell, listen, speak, naturalListen, status, dueAt }
//   - status: 'new' | 'learning' | 'reviewing' | 'mastered' | 'failed'
//
// 阶段七会扩展为：多用户隔离 + 云端同步。

const KEYS = {
  // 阶段三
  wordProgress:     'eb.word.progress.v2',     // 5 维度 (per wordId)
  // 阶段四
  naturalListening: 'eb.natural.listening.v1', // 保留旧 key 兼容 (阶段四填)
  // 通用
  favorites:        'eb.favorites.v1',
  settings:         'eb.settings.v1',
  sceneProgress:    'eb.scene.progress.v1',
  // 阶段三新增
  trainingLog:      'eb.training.log.v1',     // 答题流水（统计 + 错题回炉）
};

const DEFAULTS = {
  [KEYS.wordProgress]: {},
  [KEYS.naturalListening]: {},
  [KEYS.favorites]: { words: [], sentences: [] },
  [KEYS.settings]: {
    showIpa: true,
    showNaturalChanges: true,
    showStress: true,
    showChineseHint: true,
  },
  [KEYS.sceneProgress]: {},
  [KEYS.trainingLog]: { history: [] },  // 每次答题推一条
};

// 微信基础库 (3.16.x 之前) 没有原生 structuredClone，用 JSON deep clone 兜底
function _clone(v) {
  if (v === null || v === undefined) return v;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    if (Array.isArray(v)) return v.slice();
    if (typeof v === 'object') return Object.assign({}, v);
    return v;
  }
}

function get(key) {
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || v === undefined) {
      return _clone(DEFAULTS[key] ?? null);
    }
    return v;
  } catch (e) {
    console.warn('[user-data] get fail:', key, e?.message);
    return _clone(DEFAULTS[key] ?? null);
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    console.warn('[user-data] set fail:', key, e?.message);
    return false;
  }
}

function update(key, patcher) {
  const cur = get(key);
  const next = patcher(cur);
  return set(key, next);
}

function clearAll() {
  for (const k of Object.values(KEYS)) {
    try { wx.removeStorageSync(k); } catch (e) {}
  }
}

// === 阶段三 wordProgress helpers ===

/**
 * 读一个 word 的 progress（不存在则返回空）
 */
function getWordProgress(wordId) {
  const all = get(KEYS.wordProgress);
  return all[wordId] || null;
}

/**
 * 写一个 word 的 progress（merge 现有）
 */
function setWordProgress(wordId, patch) {
  return update(KEYS.wordProgress, (all) => {
    const cur = all[wordId] || _newWordProgress();
    all[wordId] = Object.assign({}, cur, patch, { lastAt: Date.now() });
    return all;
  });
}

function _newWordProgress() {
  return {
    firstAt: Date.now(),
    lastAt: Date.now(),
    exposure: 0,        // 见过次数
    recall: 0,          // 认对次数 (multiple choice correct)
    spell: 0,           // 拼对次数
    listen: 0,          // 听音辨词对次数
    speak: 0,           // 主动说对次数 (阶段四跟读)
    naturalListen: 0,   // 自然口语听对次数 (阶段四)
    status: 'new',      // new | learning | reviewing | mastered | failed
    dueAt: 0,           // 下次复习时间戳
  };
}

/**
 * 推一条训练 log
 */
function pushTrainingLog(entry) {
  return update(KEYS.trainingLog, (cur) => {
    cur.history.push(Object.assign({ ts: Date.now() }, entry));
    // 限 2000 条（防爆 wxapkg 存储）
    if (cur.history.length > 2000) cur.history = cur.history.slice(-2000);
    return cur;
  });
}

function getTrainingLog() {
  return get(KEYS.trainingLog);
}

module.exports = {
  KEYS,
  get, set, update, clearAll,
  getWordProgress, setWordProgress, pushTrainingLog, getTrainingLog,
};
