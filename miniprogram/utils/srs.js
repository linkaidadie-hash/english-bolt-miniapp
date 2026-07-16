// utils/srs.js — 间隔复习算法 (Spaced Repetition System, simplified)
//
// 阶段三规则（按 PROJECT-OUTLINE.md）：
//   完全忘记   → 当天稍后   (10 分钟后 due)
//   模糊       → 1 天后
//   基本记住   → 3 天后
//   熟练       → 7 天后
//   能听会说   → 21 天后
//
// 评分接口：srs.score(answer, quality)  quality ∈ 'forgot' | 'vague' | 'remembered' | 'proficient' | 'fluent'
// 返回 { nextDueAt, nextStatus, increment }

const STAGE_MS = {
  forgot:     10 * 60 * 1000,        // 10 分钟
  vague:      1 * 24 * 60 * 60 * 1000,   // 1 天
  remembered: 3 * 24 * 60 * 60 * 1000,   // 3 天
  proficient: 7 * 24 * 60 * 60 * 1000,   // 7 天
  fluent:     21 * 24 * 60 * 60 * 1000,  // 21 天
};

const STATUS_BY_QUALITY = {
  forgot:     'learning',  // 完全忘记 → 进入 learning
  vague:      'learning',
  remembered: 'reviewing',
  proficient: 'reviewing',
  fluent:     'mastered',
};

/**
 * 算下次复习时间 + 新状态
 * @param {string} quality - 'forgot' | 'vague' | 'remembered' | 'proficient' | 'fluent'
 * @param {object} curProgress - 当前 progress
 * @returns {{ dueAt, status, increment, isCorrect }}
 */
function score(quality, curProgress) {
  const valid = ['forgot', 'vague', 'remembered', 'proficient', 'fluent'];
  if (!valid.includes(quality)) throw new Error('srs.score: invalid quality ' + quality);

  const isCorrect = quality !== 'forgot';
  const offset = STAGE_MS[quality];
  const dueAt = Date.now() + offset;
  const status = STATUS_BY_QUALITY[quality];

  return {
    dueAt,
    status,
    increment: { exposure: 1, recall: isCorrect ? 1 : 0 },
    isCorrect,
    quality,
  };
}

/**
 * 列出到期的 wordIds（dueAt <= now）
 * @param {object} allProgress - { [wordId]: progress }
 * @returns {string[]} dueWordIds
 */
function getDueWords(allProgress) {
  const now = Date.now();
  const out = [];
  for (const [wid, p] of Object.entries(allProgress || {})) {
    if (p.dueAt && p.dueAt <= now) out.push(wid);
  }
  return out;
}

/**
 * 算学习进度（5 维度），返回 { known, listen, naturalListen, speak, spell, total }
 * @param {object} allProgress
 * @param {object} repoWords - data-repository 的所有 word 引用（用于过滤到核心 3000 词）
 */
function computeStats(allProgress, repoWords) {
  const all = allProgress || {};
  const ids = new Set(Object.keys(all));
  let known = 0, spell = 0, listen = 0, speak = 0, naturalListen = 0;
  for (const id of ids) {
    const p = all[id];
    if (p.recall >= 1) known++;
    if (p.spell >= 1) spell++;
    if (p.listen >= 1) listen++;
    if (p.speak >= 1) speak++;
    if (p.naturalListen >= 1) naturalListen++;
  }
  return {
    total: ids.size,
    known,
    spell,
    listen,
    speak,
    naturalListen,
    mastered: Object.values(all).filter(p => p.status === 'mastered').length,
  };
}

module.exports = {
  score,
  getDueWords,
  computeStats,
  STAGE_MS,
  STATUS_BY_QUALITY,
};
