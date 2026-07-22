// pages/natural/train.js — 通用训练模式页 (1 generic + ?mode=)
//
// 5 个 mode (阶段四 B 完整闭环):
//   - listen-and-guess:  听自然猜原句 (4 选 1, 训练 IPA 弱读/连读解码)
//   - sound-to-words:    听自然 + segmented clear chunks, 拼回原句
//   - slow-vs-natural:   慢速 vs 自然对比 + IPA + 音变说明
//   - mark-changes:      听自然, 标注口语变化位置 (弱读/连读/同化/吞音/闪音/重音)
//   - shadow:            听自然, 跟读录音 + 原音对比 + 自评
//   - caption-repeat:    听自然, 隐藏字幕复述, 主动揭晓看原文
//
// 路由: /pages/natural/train?mode=...&lesson=weak-form
//   - mode 必填
//   - lesson 可选, 不传 = 全部 180 句随机出题

const tts = require('../../utils/tts.js');
const recorder = require('../../utils/recorder.js');
const naturalData = require('../../utils/natural-data.js');
const userData = require('../../utils/user-data.js');
const { normalize, joinByIndices } = require('../../utils/text-normalize.js');

const MODES = {
  'listen-and-guess': {
    name: '听自然猜原句',
    icon: '👂',
    desc: '听自然语速发音, 从 4 个选项中选原句。训练弱读/连读/同化的解码能力。',
  },
  'sound-to-words': {
    name: '声音切词',
    icon: '🔪',
    desc: '听自然版, 把听到的慢速分段按正确顺序拼成原句。训练意群分割 + 单词识别。',
  },
  'slow-vs-natural': {
    name: '慢速 vs 自然',
    icon: '⚖️',
    desc: '对比慢速与自然两版音频, 看 IPA 差异与变化点, 理解自然语速发生了什么。',
  },
  'mark-changes': {
    name: '标注口语变化',
    icon: '🎯',
    desc: '听自然版, 在原句上标注弱读/连读/同化/吞音/闪音/重音位置。训练耳朵对音变的识别。',
  },
  'shadow': {
    name: '跟读模仿',
    icon: '🎙️',
    desc: '听自然版, 跟读录音, 与原音对比, 自评相似度。',
  },
  'caption-repeat': {
    name: '隐藏字幕复述',
    icon: '👀',
    desc: '隐藏英文原句和中文翻译, 尝试复述。主动揭晓后看原句、变化点。',
  },
};

// 8 类音变 (阶段四 B 训练标注用)
const CHANGE_TYPES = [
  { id: 'weak', label: '弱读', emoji: 'w' },
  { id: 'linking', label: '连读', emoji: '↔' },
  { id: 'assimilation', label: '同化', emoji: '≈' },
  { id: 'elision', label: '吞音', emoji: '∅' },
  { id: 'flap', label: '闪音', emoji: '~' },
  { id: 'stress', label: '重音', emoji: '★' },
  { id: 'contraction', label: '缩写', emoji: '\'' },
  { id: 'informal', label: '非正式', emoji: 'i' },
];

// 从 sentence.pronunciationNotes 推断每条句子主要的变化类型 (用关键词匹配)
function _inferChangeTypes(s) {
  if (!s.pronunciationNotes || s.pronunciationNotes.length === 0) return [];
  const text = s.pronunciationNotes.join(' ');
  const out = [];
  if (/弱读|kən|jə/.test(text)) out.push('weak');
  if (/连读|↔|n|j|w/.test(text)) out.push('linking');
  if (/同化|didja|meetcha|tj/.test(text)) out.push('assimilation');
  if (/吞音|∅|next|don.?t/.test(text)) out.push('elision');
  if (/闪音|flap|tap/.test(text)) out.push('flap');
  if (/重音|stress/.test(text)) out.push('stress');
  if (/缩写|contraction|wan|gonna|lemme/.test(text)) out.push('contraction');
  if (/非正式|informal|slang/.test(text)) out.push('informal');
  return out;
}

const STORAGE_KEY = 'natural-train-progress-v1';  // 历史 key, 实际读写走 userData (userData 会迁)
const WRONG_KEY = 'natural-train-wrong-v1';         // 同上

Page({
  data: {
    mode: null,
    modeMeta: null,
    lessonId: null,
    pool: [],
    idx: 0,
    progress: { done: 0, total: 0, correct: 0, passRate: 0 },
    finished: false,
    audioReady: false,

    // mode 1
    options: [], picked: null, correctIdx: null, guessResult: null,

    // mode 2
    chunks: [], selectedWords: [], wordResult: null, correctOrder: [], wrongPositions: [],

    // mode 4 (mark-changes) state
    changeTypes: CHANGE_TYPES,
    activeChange: null,        // 当前选中的变化类型 id
    wordMarks: {},              // { wordIdx: [changeId, ...] }
    markResult: null,           // null | 'correct' | 'wrong'
    markFeedback: [],           // [{ wordIdx, expected, picked, correct }]

    // mode 5 (shadow) state
    recordPath: null,           // 当前录音文件路径
    recordDuration: 0,          // 录音时长 ms
    recordStatus: 'idle',       // idle | preparing | recording | recorded | denied | error
    selfRating: null,           // 1=不像 2=一般 3=接近
    showReplayCompare: false,

    // mode 6 (caption-repeat) state
    reveal: false,              // 揭晓状态
    captionSelfText: '',        // 用户输入的复述
  },

  onLoad(options) {
    const mode = options.mode;
    if (!mode || !MODES[mode]) {
      wx.showToast({ title: '训练模式不存在', icon: 'error' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    const lessonId = options.lesson || null;
    this.setData({ mode, modeMeta: MODES[mode], lessonId });
    wx.setNavigationBarTitle({ title: MODES[mode].name });
    this._buildPool();
    this._loadCurrent();
  },

  onUnload() {
    try { tts.stop && tts.stop(); } catch (e) {}
    try { recorder.stop(); } catch (e) {}
    if (this._recUnsub) this._recUnsub();
  },

  // ============== 训练池构建 ==============
  _buildPool() {
    const allSentences = [];
    if (this.data.lessonId) {
      const lesson = naturalData.getLesson(this.data.lessonId);
      if (lesson) {
        for (const s of lesson.sentences) {
          if (s.audioClear.status === 'ready' && s.audioNatural.status === 'ready') {
            allSentences.push({ ...s, lessonId: this.data.lessonId });
          }
        }
      }
    } else {
      for (const l of naturalData.getAllLessons()) {
        for (const s of l.sentences) {
          if (s.audioClear.status === 'ready' && s.audioNatural.status === 'ready') {
            allSentences.push({ ...s, lessonId: l.id });
          }
        }
      }
    }
    if (allSentences.length === 0) {
      this.setData({ pool: [], audioReady: false });
      return;
    }
    const shuffled = this._shuffle([...allSentences]);
    const poolSize = Math.min(10, allSentences.length);
    this.setData({
      pool: shuffled.slice(0, poolSize),
      audioReady: true,
      progress: { done: 0, total: poolSize, correct: 0, passRate: 0 },
    });
  },

  _shuffle(arr) {
    const n = arr.length;
    if (n <= 1) return arr;
    const original = [...arr];
    for (let attempt = 0; attempt < 20; attempt++) {
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      if (this._shuffleValid(original, arr)) return arr;
    }
    arr.push(arr.shift());
    return arr;
  },

  _shuffleValid(original, shuffled) {
    const n = original.length;
    if (n === 1) return false;
    if (n === 2) return shuffled[0] !== original[0] && shuffled[1] !== original[1];
    let diff = 0;
    for (let i = 0; i < n; i++) if (original[i] !== shuffled[i]) diff++;
    return diff >= 2;
  },

  _loadCurrent() {
    if (this.data.idx >= this.data.pool.length) {
      this._finish();
      return;
    }
    const s = this.data.pool[this.data.idx];
    // 重置 mode-specific state
    this.setData({
      picked: null, guessResult: null,
      selectedWords: [], wordResult: null, wrongPositions: [],
      activeChange: null, wordMarks: {}, markResult: null, markFeedback: [],
      recordPath: null, recordDuration: 0, recordStatus: 'idle', selfRating: null, showReplayCompare: false,
      reveal: false, captionSelfText: '',
    });
    switch (this.data.mode) {
      case 'listen-and-guess': return this._setupGuess(s);
      case 'sound-to-words':   return this._setupWords(s);
      case 'slow-vs-natural':  return this._setupSlowNatural(s);
      case 'mark-changes':     return this._setupMarkChanges(s);
      case 'shadow':           return this._setupShadow(s);
      case 'caption-repeat':   return this._setupCaptionRepeat(s);
    }
  },

  // ============== mode 1: listen-and-guess ==============
  _setupGuess(s) {
    const lesson = naturalData.getLesson(s.lessonId);
    const others = (lesson ? lesson.sentences : []).filter(x => x.id !== s.id);
    const distractors = this._shuffle([...others]).slice(0, 3);
    const options = this._shuffle([s, ...distractors]).map((x, i) => ({
      idx: i, text: x.writtenText, sentenceId: x.id, isCorrect: x.id === s.id,
    }));
    this.setData({
      options,
      correctIdx: options.findIndex(o => o.isCorrect),
    });
  },

  onPickOption(e) {
    if (this.data.picked !== null) return;
    const idx = e.currentTarget.dataset.idx;
    const isCorrect = idx === this.data.correctIdx;
    this.setData({ picked: idx, guessResult: isCorrect ? 'correct' : 'wrong' });
    this._updateProgress(isCorrect);
    const s = this.data.pool[this.data.idx];
    setTimeout(() => this._playAudio(s.audioNatural.url, `n:${s.id}`), 400);
  },

  onReplayGuess() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioNatural.url, `n:${s.id}`);
  },

  onNext() {
    this.setData({ idx: this.data.idx + 1 });
    this._loadCurrent();
  },

  // ============== mode 2: sound-to-words ==============
  _setupWords(s) {
    const segs = s.audioSegmented || [];
    const allChunks = segs.map((c, i) => ({
      idx: i, text: c.clearText, audioUrl: c.clearUrl, naturalUrl: c.naturalUrl, used: false,
    }));
    const shuffled = this._shuffle([...allChunks]);
    const correctOrder = allChunks.map((_, i) => i);
    this.setData({ chunks: shuffled, correctOrder });
  },

  onUndoWord() {
    if (this.data.wordResult !== null) return;
    if (this.data.selectedWords.length === 0) return;
    const selected = [...this.data.selectedWords];
    const lastOriginalIdx = selected.pop();
    this.setData({ selectedWords: selected });
    const chunks = this.data.chunks.map(c => c.idx === lastOriginalIdx ? { ...c, used: false } : c);
    this.setData({ chunks });
  },

  onClearWords() {
    if (this.data.wordResult !== null) return;
    this.setData({ selectedWords: [] });
    const chunks = this.data.chunks.map(c => ({ ...c, used: false }));
    this.setData({ chunks });
  },

  onConfirmWords() {
    if (this.data.wordResult !== null) return;
    if (this.data.selectedWords.length !== this.data.chunks.length) return;
    const s = this.data.pool[this.data.idx];
    const correctOrder = this.data.correctOrder;
    const selected = this.data.selectedWords;
    // 切词判定 (P0-1 修复 2026-07-19):
    //   1) 拼接用户选中的 chunk texts (按选中顺序) → userText
    //   2) 拼接正确顺序的 chunk texts → correctText
    //   3) normalize(userText) === normalize(correctText)
    //   4) 不再用 selected[i] === correctOrder[i] 的位置比较 (会因 shuffle 误判)
    //   5) 详见 utils/text-normalize.js + tools/test-text-normalize.mjs
    const userText = joinByIndices(this.data.chunks, selected);
    const correctText = joinByIndices(this.data.chunks, correctOrder);
    const isCorrect = normalize(userText) === normalize(correctText);
    // 错位标记: 字符串不等时标红所有位置 (UI 用, 单测也覆盖)
    const wrongPositions = isCorrect ? [] : selected.map((_, i) => i);
    this.setData({ wordResult: isCorrect ? 'correct' : 'wrong', wrongPositions });
    this._updateProgress(isCorrect);
    if (!isCorrect) this._recordWrong(s);
  },

  onPickWord(e) {
    if (this.data.wordResult !== null) return;
    if (this._pickingGuard) return;
    this._pickingGuard = true;
    setTimeout(() => { this._pickingGuard = false; }, 80);
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    if (isNaN(idx)) return;
    const c = this.data.chunks[idx];
    if (!c || c.used) return;
    const selected = [...this.data.selectedWords, idx];
    this.setData({ selectedWords: selected });
    const chunks = this.data.chunks.map((cc, i) => i === idx ? { ...cc, used: true } : cc);
    this.setData({ chunks });
    if (c.audioUrl) {
      if (!this._prewarmed) {
        this._prewarmed = true;
        tts.prewarm().finally(() => this._playAudio(c.audioUrl, `wp:${idx}`));
      } else {
        this._playAudio(c.audioUrl, `wp:${idx}`);
      }
    }
  },

  onPlayWordOnly(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const c = this.data.chunks[idx];
    if (!c || !c.audioUrl) return;
    this._playAudio(c.audioUrl, `w:${idx}`);
  },

  onReplayNatural() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioNatural.url, `nf:${s.id}`);
  },

  // ============== mode 3: slow-vs-natural ==============
  _setupSlowNatural(s) {},

  onPlayClear() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioClear.url, `c:${s.id}`);
  },

  onPlayNatural() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioNatural.url, `n:${s.id}`);
  },

  // ============== mode 4: mark-changes ==============
  _setupMarkChanges(s) {
    // 用 speechChunks 拆词 (没有则按空格拆 writtenText)
    const chunks = s.speechChunks && s.speechChunks.length
      ? s.speechChunks
      : s.writtenText.split(/\s+/).filter(Boolean);
    // 给每个 word 标 expected 变化 (从 pronunciationNotes 推断)
    const expected = {};
    const types = _inferChangeTypes(s);
    // 简化: 如果有任何 notes, 给最后一个 word (重点音变) 标所有 expected types
    // 更细粒度分析留给后续, 阶段四 B 用宽松规则: 含 notes 的句子任一标对即算部分对
    if (types.length > 0 && chunks.length > 0) {
      // 标最后一个词 (重点) 含全部 expected
      expected[chunks.length - 1] = types;
    }
    this.setData({
      changeTypes: CHANGE_TYPES,
      activeChange: null,
      wordMarks: {},
      markResult: null,
      markFeedback: [],
      _markChunks: chunks,
      _markExpected: expected,
    });
    this._markWords = chunks.map((text, i) => ({ idx: i, text }));
    this.setData({ markWords: this._markWords });
  },

  onSelectChangeType(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ activeChange: this.data.activeChange === id ? null : id });
  },

  onToggleMarkWord(e) {
    if (this.data.markResult !== null) return;
    const wi = parseInt(e.currentTarget.dataset.wi, 10);
    const cid = this.data.activeChange;
    if (isNaN(wi) || !cid) {
      if (!cid) wx.showToast({ title: '先选一种变化类型', icon: 'none' });
      return;
    }
    const marks = { ...this.data.wordMarks };
    const cur = marks[wi] || [];
    if (cur.includes(cid)) {
      marks[wi] = cur.filter(x => x !== cid);
      if (marks[wi].length === 0) delete marks[wi];
    } else {
      marks[wi] = [...cur, cid];
    }
    this.setData({ wordMarks: marks });
  },

  onSubmitMark() {
    if (this.data.markResult !== null) return;
    const expected = this._markExpected || {};
    const expectedWords = Object.keys(expected).map(Number);
    const picked = Object.keys(this.data.wordMarks).map(Number);
    // 评分: 至少标对一个 expected 位置算 partial 正确 (宽松规则, 鼓励参与)
    let hit = 0;
    for (const wi of expectedWords) {
      const expTypes = expected[wi] || [];
      const gotTypes = this.data.wordMarks[wi] || [];
      if (expTypes.some(t => gotTypes.includes(t))) hit++;
    }
    const isCorrect = expectedWords.length === 0 || hit > 0;
    const feedback = [];
    for (let i = 0; i < this._markWords.length; i++) {
      const exp = expected[i] || [];
      const got = this.data.wordMarks[i] || [];
      feedback.push({
        idx: i, text: this._markWords[i].text,
        expected: exp, picked: got,
        correct: exp.length === 0 ? (got.length === 0) : exp.some(t => got.includes(t)),
      });
    }
    this.setData({ markResult: isCorrect ? 'correct' : 'wrong', markFeedback: feedback });
    this._updateProgress(isCorrect);
    const s = this.data.pool[this.data.idx];
    if (!isCorrect) this._recordWrong(s);
  },

  onClearMarks() {
    if (this.data.markResult !== null) return;
    this.setData({ wordMarks: {} });
  },

  // ============== mode 5: shadow (跟读录音) ==============
  _setupShadow(s) {
    // 自动预热 + 预播放一次原音
    this._shadowAutoPlayed = false;
    this._unsubRec = recorder.onEvent((evt) => {
      if (evt.type === 'start') {
        this.setData({ recordStatus: 'recording' });
      } else if (evt.type === 'stop') {
        this.setData({ recordStatus: 'recorded', recordPath: evt.tempFilePath, recordDuration: evt.duration });
      } else if (evt.type === 'error') {
        this.setData({ recordStatus: 'error' });
        wx.showToast({ title: '录音失败', icon: 'none' });
      }
    });
  },

  onShadowPlayNatural() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioNatural.url, `sh:${s.id}`);
    if (!this._shadowAutoPlayed) {
      this._shadowAutoPlayed = true;
      // 第一次进入: 0.5s 后自动播一次原音 (提示用户听)
      // 这里不强制自动, 让用户自己点
    }
  },

  async onShadowStartRecord() {
    if (this.data.recordStatus === 'recording') return;
    this.setData({ recordStatus: 'preparing', recordPath: null, selfRating: null, showReplayCompare: false });
    const r = await recorder.start({ maxDuration: 30000 });
    if (!r.granted) {
      this.setData({ recordStatus: 'denied' });
      // 不弹 toast 反复骚扰, 静默降级, 让用户用"听"训练
      return;
    }
    if (!r.started) {
      this.setData({ recordStatus: 'error' });
      wx.showToast({ title: '录音启动失败', icon: 'none' });
      return;
    }
    // onStart 事件会更新 status
  },

  onShadowStopRecord() {
    if (this.data.recordStatus !== 'recording') return;
    recorder.stop();
    // onStop 会更新 status
  },

  onShadowOpenSettings() {
    wx.showModal({
      title: '需要录音权限',
      content: '跟读训练需要使用麦克风录音。点击"去设置"开启后即可使用。',
      confirmText: '去设置',
      cancelText: '仅听',
      success: async (res) => {
        if (res.confirm) {
          const ok = await recorder.openSettings();
          if (ok) {
            this.setData({ recordStatus: 'idle' });
            wx.showToast({ title: '已开启权限', icon: 'success' });
          }
        }
      },
    });
  },

  onShadowPlayOriginal() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioNatural.url, `orig:${s.id}`);
  },

  onShadowPlayMine() {
    if (!this.data.recordPath) return;
    tts.speak(this.data.recordPath, {
      onError: () => wx.showToast({ title: '回放失败', icon: 'none' }),
    });
  },

  onShadowToggleCompare() {
    this.setData({ showReplayCompare: !this.data.showReplayCompare });
  },

  onShadowRate(e) {
    const v = parseInt(e.currentTarget.dataset.v, 10);
    this.setData({ selfRating: v });
    this._updateProgress(true);  // 完成一次跟读即算 progress
  },

  // ============== mode 6: caption-repeat (隐藏字幕复述) ==============
  _setupCaptionRepeat(s) {
    this.setData({ reveal: false, captionSelfText: '' });
  },

  onCaptionPlayNatural() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioNatural.url, `cap:${s.id}`);
  },

  onCaptionInput(e) {
    this.setData({ captionSelfText: e.detail.value });
  },

  onCaptionReveal() {
    this.setData({ reveal: true });
    this._updateProgress(true);
  },

  onCaptionRecord() {
    // 跟读共用, 调 shadow start (避免重复代码)
    this.setData({ mode: 'shadow' });  // 临时, 然后用 shadow 的录音
    // 不太干净, 改用直接调
    // 简化: 这里调 _setupShadow 然后 start
    this._setupShadow(this.data.pool[this.data.idx]);
    this.onShadowStartRecord();
    // 恢复 mode
    setTimeout(() => this.setData({ mode: this.data.mode || 'caption-repeat' }), 0);
  },

  onCaptionRecordStop() {
    this.onShadowStopRecord();
  },

  onCaptionPlayMine() {
    this.onShadowPlayMine();
  },

  // ============== 公共 ==============
  _playAudio(url, tag) {
    if (!url) {
      wx.showToast({ title: '音频 URL 为空', icon: 'error' });
      return;
    }
    tts.speak(url, {
      onError: () => wx.showToast({ title: '播放失败', icon: 'none' }),
    });
  },

  _updateProgress(correct) {
    const p = { ...this.data.progress };
    p.done = this.data.idx + 1;
    if (correct) p.correct += 1;
    p.passRate = p.done === 0 ? 0 : Math.round(p.correct / p.done * 100);
    this.setData({ progress: p });
    this._saveProgress(correct);
  },

  _saveProgress(correct) {
    try {
      const mode = this.data.mode;
      const lessonId = this.data.lessonId;
      const cur = userData.getNaturalTrain(mode, lessonId) || { total: 0, correct: 0, lastAt: null };
      const newTotal = (cur.total || 0) + 1;
      const newCorrect = (cur.correct || 0) + (correct ? 1 : 0);
      userData.setNaturalTrain(mode, lessonId, {
        total: newTotal,
        correct: newCorrect,
        passRate: Math.round((newCorrect / newTotal) * 100),
        lastAt: new Date().toISOString(),
      });
    } catch (e) {}
  },

  _recordWrong(s) {
    try {
      userData.pushNaturalWrong(this.data.mode, this.data.lessonId, {
        lessonId: s.lessonId,
        sentenceId: s.id,
        clearText: s.clearText,
        naturalText: s.naturalText,
        wrongAt: new Date().toISOString(),
      });
    } catch (e) {}
  },

  _finish() {
    this.setData({ finished: true });
    try { tts.stop && tts.stop(); } catch (e) {}
    try { recorder.stop(); } catch (e) {}
  },

  onRestart() {
    this.setData({ idx: 0, finished: false });
    this._buildPool();
    this._loadCurrent();
  },

  onExit() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    return {
      title: `Vocora · ${this.data.modeMeta ? this.data.modeMeta.name : '训练'}`,
      path: `/pages/natural/train?mode=${this.data.mode}${this.data.lessonId ? '&lesson=' + this.data.lessonId : ''}`,
    };
  },
});
