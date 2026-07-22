// utils/trainer.js — 训练任务生成器
//
// 阶段三职责：
//   - 拉 ready 词（仅 1330, 避免依赖 1670 missing）
//   - 拉 new 词（userProgress 里没见过的）
//   - 拉 due 词（间隔复习到期）
//   - 组装 3 类训练任务：听音辨词 / 拼写检测 / 错题回炉
//
// 阶段四会扩展：自然口语解码 / 跟读。

const repo = require('./data-repository.js');
const userData = require('./user-data.js');
const srs = require('./srs.js');

const READY_LEVELS = [1, 2, 3, 4];  // 阶段三只用 1-4 ready 词训练 (避开部分 5/6 missing)

// 词性缩写 → 全称 (用于拼写训练释义展示, P0-2 2026-07-19)
// ECDICT 用单字母/双字母缩写, UI 展示需要全称 (modal/noun/verb)
const POS_FULL = {
  n: 'noun',
  v: 'verb',
  vt: 'verb (transitive)',
  vi: 'verb (intransitive)',
  aux: 'auxiliary verb',
  modal: 'modal verb',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  num: 'numeral',
  art: 'article',
  int: 'interjection',
  pl: 'plural',
};

/**
 * 把单个 pos 缩写扩展成全称 (用户要求 "modal / noun / verb" 格式, 多 pos 用 / 分隔)
 */
function expandPos(pos) {
  if (!pos) return '';
  // 多种 pos 用 / 隔开 (有些词如 can = modal v + noun, 但 ECDICT 只存一种)
  const parts = String(pos).split('/').map(s => s.trim()).filter(Boolean);
  return parts.map(p => POS_FULL[p] || p).join(' / ');
}

/**
 * 把 ECDICT 的 meaning 字符串 (逗号/分号/斜杠分隔的中文释义) 拆成结构化 sense 数组
 * P0-2 修复 2026-07-19:
 *   - 不再用 `${meaning} · ${ipa}` 拼一个 hint
 *   - 拆成 meanings[] (释义数组), posLabel (词性全称), ipa (音标) 三个独立字段
 *   - UI 端分开渲染, 不再出现 "装罐 · kæn" 这种混合显示
 */
function parseMeanings(meaning) {
  if (!meaning) return [];
  // 常见分隔符: 中英文逗号、中英文分号、斜杠
  const raw = String(meaning).split(/[,，;；\/]+/).map(s => s.trim()).filter(Boolean);
  return raw;
}

/**
 * 拉 ready 词列表（阶段三训练源）
 * @param {number} limit
 * @returns {Word[]}
 */
function getReadyWords(limit = 100) {
  const all = repo.getAllWords();
  return all
    .filter(w => w.audio.status === 'ready' && READY_LEVELS.includes(w.level))
    .slice(0, limit);
}

/**
 * 听音辨词训练题：给一个 word + 4 个选项（1 正 3 干扰）
 * @param {number} count
 * @returns {Array<{ word, choices: [string,string,string,string], correctIndex }>}
 */
function buildListeningQuiz(count = 10) {
  const pool = getReadyWords(200);
  if (pool.length < 4) return [];
  const result = [];
  // 洗牌
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const word = shuffled[i];
    // 选 3 个干扰
    const distractors = [];
    while (distractors.length < 3) {
      const cand = pool[Math.floor(Math.random() * pool.length)];
      if (cand.word !== word.word && !distractors.includes(cand.word)) {
        distractors.push(cand.word);
      }
    }
    const choices = [word.word, ...distractors].sort(() => Math.random() - 0.5);
    const correctIndex = choices.indexOf(word.word);
    result.push({ word, choices, correctIndex });
  }
  return result;
}

/**
 * 拼写训练题：结构化 hint (P0-2 修复)
 * @param {number} count
 * @returns {Array<{
 *   wordId, word, expected,
 *   meanings: string[],  // 中文释义数组, 多个 sense 分开
 *   posLabel: string,     // 词性全称 (e.g. "modal verb / noun")
 *   ipa: string,          // 音标 (e.g. "kæn")
 * }>}
 */
function buildSpellingQuiz(count = 10) {
  const pool = getReadyWords(200);
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(w => ({
    wordId: w.id,
    word: w.word,
    expected: w.word,
    meanings: parseMeanings(w.meaning),
    posLabel: expandPos(w.pos),
    ipa: w.ipa || '',
  }));
}

/**
 * 错题回炉：从 trainingLog 拉最近 recall=fail 的 N 个
 */
function buildReviewQuiz(count = 10) {
  const log = userData.getTrainingLog();
  // 最近 100 条里取 recall=fail 的
  const recent = log.history.slice(-100).reverse();
  const fails = recent.filter(e => e.quality === 'forgot');
  const ids = [];
  for (const e of fails) {
    if (e.wordId && !ids.includes(e.wordId)) ids.push(e.wordId);
    if (ids.length >= count) break;
  }
  // 拿这些 word 的完整数据
  const words = ids
    .map(id => repo.getWordById(id))
    .filter(Boolean);
  return buildListeningQuizFromWords(words);
}

function buildListeningQuizFromWords(words) {
  if (words.length < 4) return [];
  const pool = getReadyWords(200);
  return words.slice(0, 10).map(word => {
    const distractors = [];
    while (distractors.length < 3) {
      const cand = pool[Math.floor(Math.random() * pool.length)];
      if (cand.word !== word.word && !distractors.includes(cand.word)) {
        distractors.push(cand.word);
      }
    }
    const choices = [word.word, ...distractors].sort(() => Math.random() - 0.5);
    const correctIndex = choices.indexOf(word.word);
    return { word, choices, correctIndex };
  });
}

module.exports = {
  getReadyWords,
  buildListeningQuiz,
  buildSpellingQuiz,
  buildReviewQuiz,
  READY_LEVELS,
};
