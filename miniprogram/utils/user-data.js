// utils/user-data.js — 阶段七 统一用户数据仓库
//
// 集中所有 wx.setStorageSync / getStorageSync 调用
// 散落 key 兼容旧数据
//
// 职责:
//   - 学习进度 (wordProgress)
//   - 错题 (trainingLog)
//   - 收藏 (favorites)
//   - 设置 (settings)
//   - 场景进度 (sceneProgress)
//   - 自然口语训练 (naturalTrainProgress / naturalTrainWrong)
//   - 现实任务 (taskHistory)
//   - 自然口语掌握度 (naturalMastery)
//   - 后台播放历史 (audioPlayerHistory)
//   - 跟读记录 (shadowRecords)
//
// v2 兼容:
//   - 旧 key (eb.word.progress.v2) 保留, 读到时迁移到 v3
//   - 清空数据时, 提示 + 二次确认
//   - 不接云端, 不接账号
//   - 数据只在本地

const KEYS = {
  // 阶段三
  wordProgress:     'eb.word.progress.v3',     // 5 维度
  // 阶段四
  naturalTrainProgress: 'eb.natural.train.v1',
  naturalTrainWrong:    'eb.natural.wrong.v1',
  naturalMastery:       'eb.natural.mastery.v1',  // 180 句掌握度
  shadowRecords:        'eb.shadow.records.v1',   // 跟读记录
  // 阶段六
  sceneProgress:    'eb.scene.progress.v1',
  // 阶段六: 现实任务
  taskHistory:      'eb.task.history.v1',
  // 阶段五
  audioPlayerHistory: 'eb.audio.history.v1',
  // 通用
  favorites:        'eb.favorites.v1',
  settings:         'eb.settings.v1',
  // 阶段三
  trainingLog:      'eb.training.log.v1',
  // 阶段七: 备份 (清空前提示, 让用户取消前导一份 JSON 导出)
  backupPrefix:     'eb.backup.',
};

const DEFAULTS = {
  [KEYS.wordProgress]: {},
  [KEYS.naturalTrainProgress]: {},
  [KEYS.naturalTrainWrong]: {},
  [KEYS.naturalMastery]: {},
  [KEYS.shadowRecords]: [],
  [KEYS.sceneProgress]: {},
  [KEYS.taskHistory]: { history: [], streak: 0, lastDate: null },
  [KEYS.audioPlayerHistory]: null,
  [KEYS.favorites]: { words: [], sentences: [] },
  [KEYS.settings]: {
    showIpa: true,
    showNaturalChanges: true,
    showStress: true,
    showChineseHint: true,
    autoPlay: true,
  },
  [KEYS.trainingLog]: { history: [] },
};

// 旧 key → 新 key 迁移表
const LEGACY_KEYS = {
  'eb.word.progress.v2': KEYS.wordProgress,
  'eb.natural.listening.v1': KEYS.naturalTrainProgress,
  'eb.recorder.permission.asked': null,  // 录音权限 asked 已废弃
  // train.js 历史直接调 wx.setStorageSync 用的 key, 现迁到 userData
  'natural-train-progress-v1': KEYS.naturalTrainProgress,
  'natural-train-wrong-v1': KEYS.naturalTrainWrong,
};

let _migrated = false;
function _migrateOnce() {
  if (_migrated) return;
  _migrated = true;
  try {
    for (const oldK of Object.keys(LEGACY_KEYS)) {
      const newK = LEGACY_KEYS[oldK];
      if (!newK) continue;
      try {
        const oldV = wx.getStorageSync(oldK);
        if (oldV === '' || oldV === null || oldV === undefined) continue;
        const newV = wx.getStorageSync(newK);
        if (newV === '' || newV === null || newV === undefined) {
          // 新 key 没值, 迁移
          wx.setStorageSync(newK, oldV);
          wx.removeStorageSync(oldK);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

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
  _migrateOnce();
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || v === undefined) {
      return _clone(DEFAULTS[key] ?? null);
    }
    return v;
  } catch (e) {
    return _clone(DEFAULTS[key] ?? null);
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function update(key, patcher) {
  const cur = get(key);
  const next = patcher(cur);
  return set(key, next);
}

function remove(key) {
  try { wx.removeStorageSync(key); return true; } catch (e) { return false; }
}

/**
 * 二次确认 + 清除所有用户数据
 * @returns {Promise<boolean>} 是否清除
 */
function confirmClearAll() {
  return new Promise((resolve) => {
    wx.showModal({
      title: '清除所有学习数据?',
      content: '本操作会清空: 学习进度 / 错题 / 收藏 / 设置 / 场景进度 / 自然口语训练 / 现实任务 / 后台播放历史 / 跟读记录。词库本身 (3000 词) 不受影响。',
      confirmText: '清除',
      cancelText: '取消',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          clearAll();
          resolve(true);
        } else {
          resolve(false);
        }
      },
      fail: () => resolve(false),
    });
  });
}

function clearAll() {
  for (const k of Object.values(KEYS)) {
    if (k === KEYS.backupPrefix) continue;
    try { wx.removeStorageSync(k); } catch (e) {}
  }
  // 旧 key 清理
  for (const oldK of Object.keys(LEGACY_KEYS)) {
    try { wx.removeStorageSync(oldK); } catch (e) {}
  }
}

/**
 * 导出全部数据为 JSON 字符串 (用于本地备份, 不上传)
 */
function exportAll() {
  const out = { version: 'phase7-v1', exportedAt: new Date().toISOString(), data: {} };
  for (const k of Object.values(KEYS)) {
    if (k === KEYS.backupPrefix) continue;
    try { out.data[k] = wx.getStorageSync(k); } catch (e) {}
  }
  return JSON.stringify(out, null, 2);
}

/**
 * 数据量统计
 */
function getStorageStats() {
  const stats = {};
  try {
    const info = wx.getStorageInfoSync();
    stats.totalKeys = info.keys.length;
    stats.totalSizeKB = Math.round(info.currentSize / 1024 * 10) / 10;
    stats.limitKB = Math.round(info.limitSize / 1024);
    stats.keys = info.keys;
  } catch (e) {
    stats.error = e?.message || String(e);
  }
  return stats;
}

// === 阶段三 wordProgress helpers (保留兼容) ===
function getWordProgress(wordId) {
  const all = get(KEYS.wordProgress);
  return all[wordId] || null;
}

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
    exposure: 0,
    recall: 0,
    spell: 0,
    listen: 0,
    speak: 0,
    naturalListen: 0,
    status: 'new',
    dueAt: 0,
  };
}

function pushTrainingLog(entry) {
  return update(KEYS.trainingLog, (cur) => {
    cur.history.push(Object.assign({ ts: Date.now() }, entry));
    if (cur.history.length > 2000) cur.history = cur.history.slice(-2000);
    return cur;
  });
}

function getTrainingLog() {
  return get(KEYS.trainingLog);
}

// === 阶段六: 现实任务 ===
function getTaskHistory() {
  return get(KEYS.taskHistory);
}
function saveTaskRecord(record) {
  return update(KEYS.taskHistory, (cur) => {
    cur.history = cur.history || [];
    const idx = cur.history.findIndex(h => h.date === record.date && h.taskId === record.taskId);
    if (idx >= 0) cur.history[idx] = { ...cur.history[idx], ...record };
    else cur.history.push(record);
    if (record.checkedIn) {
      const last = cur.lastDate;
      if (last) {
        const lastDate = new Date(last);
        const today = new Date(record.date);
        const diffDays = Math.round((today - lastDate) / 86400000);
        if (diffDays === 1) cur.streak = (cur.streak || 0) + 1;
        else if (diffDays > 1) cur.streak = 1;
      } else {
        cur.streak = 1;
      }
      cur.lastDate = record.date;
    }
    return cur;
  });
}

// === 阶段六: 场景进度 ===
function getSceneProgress(sceneId) {
  const all = get(KEYS.sceneProgress);
  return all[sceneId] || null;
}
function setSceneProgress(sceneId, record) {
  return update(KEYS.sceneProgress, (all) => {
    all[sceneId] = { ...(all[sceneId] || {}), ...record, lastAt: Date.now() };
    return all;
  });
}

// === 阶段四: 自然口语训练 ===
function getNaturalTrain(mode, lessonId) {
  const all = get(KEYS.naturalTrainProgress);
  const key = `${mode}:${lessonId || 'all'}`;
  return all[key] || null;
}
function setNaturalTrain(mode, lessonId, record) {
  return update(KEYS.naturalTrainProgress, (all) => {
    const key = `${mode}:${lessonId || 'all'}`;
    all[key] = { ...(all[key] || {}), ...record, lastAt: Date.now() };
    return all;
  });
}
function pushNaturalWrong(mode, lessonId, item) {
  return update(KEYS.naturalTrainWrong, (all) => {
    const key = `${mode}:${lessonId || 'all'}`;
    if (!all[key]) all[key] = { items: [] };
    if (!all[key].items.find(x => x.sentenceId === item.sentenceId)) {
      all[key].items.push(item);
    }
    return all;
  });
}
function getNaturalMastery(sentenceId) {
  const all = get(KEYS.naturalMastery);
  return all[sentenceId] || null;
}
function setNaturalMastery(sentenceId, patch) {
  return update(KEYS.naturalMastery, (all) => {
    all[sentenceId] = { ...(all[sentenceId] || {}), ...patch, lastAt: Date.now() };
    return all;
  });
}
function pushShadowRecord(record) {
  return update(KEYS.shadowRecords, (arr) => {
    arr.push({ ...record, ts: Date.now() });
    if (arr.length > 500) arr = arr.slice(-500);
    return arr;
  });
}

module.exports = {
  KEYS,
  get, set, update, remove,
  confirmClearAll, clearAll,
  exportAll, getStorageStats,
  getWordProgress, setWordProgress, pushTrainingLog, getTrainingLog,
  getTaskHistory, saveTaskRecord,
  getSceneProgress, setSceneProgress,
  getNaturalTrain, setNaturalTrain, pushNaturalWrong,
  getNaturalMastery, setNaturalMastery,
  pushShadowRecord,
};
