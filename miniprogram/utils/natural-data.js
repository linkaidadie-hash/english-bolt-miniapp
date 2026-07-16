// utils/natural-data.js — 阶段四 A 自然口语解码数据访问层
//
// 职责：
//   - 加载 9 类自然口语规则 + 180 条重点句
//   - 暴露 listLessons / getLesson / getSentence 接口
//   - 任何调用方都不能假定 audio 已就绪,必须看 audioClear.status
//
// 阶段四 A 状态：
//   - 所有 audioClear / audioNatural.status === 'pending'
//   - 不暴露训练接口,所有"训练"路径在 B 阶段完成音频部署后才打开

const naturalSentences = require('../data/natural-sentences.js');

let _meta = null;
let _byId = null;
let _byLessonId = null;
let _loaded = false;

function _index() {
  if (_loaded) return;
  _meta = naturalSentences.meta;
  _byLessonId = Object.create(null);
  _byId = Object.create(null);
  for (const l of naturalSentences.lessons) {
    _byLessonId[l.id] = l;
    for (const s of l.sentences) {
      _byId[s.id] = s;
    }
  }
  _loaded = true;
}

function _assertLoaded() {
  _index();
  if (!_loaded) throw new Error('natural-data: load failed');
}

// === Meta ===
function getMeta() {
  _assertLoaded();
  return _meta;
}

function getAudioStatusSummary() {
  _assertLoaded();
  let total = 0;
  let audioReady = 0;
  let audioPending = 0;
  for (const l of naturalSentences.lessons) {
    for (const s of l.sentences) {
      total++;
      if (s.audioClear.status === 'ready' && s.audioNatural.status === 'ready') {
        audioReady++;
      } else {
        audioPending++;
      }
    }
  }
  return { total, audioReady, audioPending, audioReadyPct: total === 0 ? 0 : Math.round(audioReady / total * 100) };
}

// === Lessons ===
function getAllLessons() {
  _assertLoaded();
  return naturalSentences.lessons;
}

function getLessonList() {
  // 课程首页用,只返回课程元信息 + 句子数 + 音频就绪数
  _assertLoaded();
  return naturalSentences.lessons.map(l => {
    const total = l.sentences.length;
    const ready = l.sentences.filter(s => s.audioClear.status === 'ready' && s.audioNatural.status === 'ready').length;
    return {
      id: l.id,
      name: l.name,
      icon: l.icon,
      subtitle: l.subtitle,
      sentenceCount: total,
      audioReady: ready,
      audioPending: total - ready,
    };
  });
}

function getLesson(id) {
  _assertLoaded();
  return _byLessonId[id] || null;
}

function getSentence(id) {
  _assertLoaded();
  return _byId[id] || null;
}

function getSentencesByLesson(lessonId) {
  const l = getLesson(lessonId);
  return l ? l.sentences : [];
}

function isAudioReadyForLesson(lessonId) {
  const l = getLesson(lessonId);
  if (!l) return false;
  return l.sentences.every(s => s.audioClear.status === 'ready' && s.audioNatural.status === 'ready');
}

module.exports = {
  getMeta,
  getAudioStatusSummary,
  getAllLessons,
  getLessonList,
  getLesson,
  getSentence,
  getSentencesByLesson,
  isAudioReadyForLesson,
};
