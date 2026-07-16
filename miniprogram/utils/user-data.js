// utils/user-data.js — v2 用户数据仓库
//
// 阶段一职责：
//   - 统一封装 wx.setStorageSync / wx.getStorageSync
//   - 集中所有 key（避免各 page 散落 storage key 命名）
//   - 给每个 key 一份默认值 + 升级时的 migration 占位
//
// 阶段七会扩展为：多用户隔离 + 本地存储 + 可选云端同步。

const KEYS = {
  // 阶段三：学习进度
  wordProgress:     'eb.word.progress.v1',       // { [wordId]: { seen, recall, listen, speak, scene, lastAt } }
  // 阶段四：自然口语听力掌握度（与 wordProgress 分开，因为"认识 ≠ 听懂自然语速"）
  naturalListening: 'eb.natural.listening.v1',
  // 通用
  favorites:        'eb.favorites.v1',
  settings:         'eb.settings.v1',
  // 阶段六：场景进度
  sceneProgress:    'eb.scene.progress.v1',
};

const DEFAULTS = {
  [KEYS.wordProgress]:     {},
  [KEYS.naturalListening]: {},
  [KEYS.favorites]:        { words: [], sentences: [] },
  [KEYS.settings]: {
    showIpa: true,
    showNaturalChanges: true,
    showStress: true,
    showChineseHint: true,   // 中文近似音（初学者开）
  },
  [KEYS.sceneProgress]:    {},
};

function get(key) {
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || v === undefined) {
      return structuredClone(DEFAULTS[key] ?? null);
    }
    return v;
  } catch (e) {
    console.warn('[user-data] get fail:', key, e?.message);
    return structuredClone(DEFAULTS[key] ?? null);
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
  // 阶段一保留。仅调试用。
  for (const k of Object.values(KEYS)) {
    try { wx.removeStorageSync(k); } catch (e) {}
  }
}

module.exports = { KEYS, get, set, update, clearAll };
