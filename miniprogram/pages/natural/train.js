// pages/natural/train.js — 通用训练模式页 (1 generic + ?mode=)
//
// 3 个 mode:
//   - listen-and-guess: 听自然猜原句 (4 选 1, 训练 IPA 弱读/连读解码)
//   - sound-to-words:   听自然 + segmented clear chunks, 拼回原句
//   - slow-vs-natural:  慢速 vs 自然对比 + IPA + 音变说明
//
// 路由: /pages/natural/train?mode=listen-and-guess&lesson=weak-form
//   - mode 必填
//   - lesson 可选, 不传 = 全部 180 句随机出题

const tts = require('../../utils/tts.js');
const naturalData = require('../../utils/natural-data.js');

const MODES = {
  'listen-and-guess': {
    name: '听自然猜原句',
    icon: '👂',
    desc: '听自然语速发音, 从 4 个选项中选原句。训练弱读/连读/同化的解码能力。',
  },
  'sound-to-words': {
    name: '声音切词',
    icon: '🔪',
    desc: '听慢速分段音频, 把听到的词拼回原句。训练意群分割与单词识别。',
  },
  'slow-vs-natural': {
    name: '慢速 vs 自然',
    icon: '⚖️',
    desc: '对比慢速与自然两版音频, 看 IPA 差异与变化点, 理解自然语速发生了什么。',
  },
};

const STORAGE_KEY = 'natural-train-progress-v1';
const POOL_SIZE = 10;        // 每次训练的句子池大小
const PASS_THRESHOLD = 0.7;  // 通过率阈值 (v1: 只统计, 不卡通过)

Page({
  data: {
    mode: null,
    modeMeta: null,
    lessonId: null,         // null = 全部 180 句
    pool: [],               // 当前训练的句子池
    idx: 0,                 // 当前题号
    progress: { done: 0, total: 0, correct: 0, passRate: 0 },
    finished: false,

    // listen-and-guess state
    options: [],            // 4 选 1 的 options (含正确答案标记)
    picked: null,           // 用户选的下标
    correctIdx: null,       // 正确答案下标
    guessResult: null,      // 'correct' | 'wrong' | null

    // sound-to-words state
    chunks: [],             // 当前句的 audioSegmented (clear chunks)
    selectedWords: [],      // 用户按顺序选中的 chunk index
    wordResult: null,       // 'correct' | 'wrong' | null

    // slow-vs-natural state
    audioReady: false,
  },

  onLoad(options) {
    const mode = options.mode;
    if (!mode || !MODES[mode]) {
      wx.showToast({ title: '训练模式不存在', icon: 'error' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    const lessonId = options.lesson || null;
    this.setData({
      mode,
      modeMeta: MODES[mode],
      lessonId,
    });
    wx.setNavigationBarTitle({ title: MODES[mode].name });

    this._buildPool();
    this._loadCurrent();
  },

  onUnload() {
    try { tts.stop && tts.stop(); } catch (e) {}
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
    // 随机抽样 (Fisher-Yates 部分洗)
    const shuffled = this._shuffle([...allSentences]);
    const poolSize = Math.min(POOL_SIZE, allSentences.length);
    this.setData({
      pool: shuffled.slice(0, poolSize),
      audioReady: true,
      progress: { done: 0, total: poolSize, correct: 0, passRate: 0 },
    });
  },

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  _loadCurrent() {
    if (this.data.idx >= this.data.pool.length) {
      this._finish();
      return;
    }
    const s = this.data.pool[this.data.idx];
    this.setData({
      picked: null,
      guessResult: null,
      selectedWords: [],
      wordResult: null,
    });
    switch (this.data.mode) {
      case 'listen-and-guess': return this._setupGuess(s);
      case 'sound-to-words':   return this._setupWords(s);
      case 'slow-vs-natural':  return this._setupSlowNatural(s);
    }
  },

  // ============== mode 1: listen-and-guess ==============

  _setupGuess(s) {
    // 4 选 1: 1 正确 + 3 干扰 (同 lesson 的其他句子)
    const lesson = naturalData.getLesson(s.lessonId);
    const others = (lesson ? lesson.sentences : []).filter(x => x.id !== s.id);
    const distractors = this._shuffle([...others]).slice(0, 3);
    const options = this._shuffle([s, ...distractors]).map((x, i) => ({
      idx: i,
      text: x.writtenText,
      sentenceId: x.id,
      isCorrect: x.id === s.id,
    }));
    this.setData({
      options,
      correctIdx: options.findIndex(o => o.isCorrect),
    });
  },

  onPickOption(e) {
    if (this.data.picked !== null) return;  // 已选过
    const idx = e.currentTarget.dataset.idx;
    const isCorrect = idx === this.data.correctIdx;
    this.setData({
      picked: idx,
      guessResult: isCorrect ? 'correct' : 'wrong',
    });
    this._updateProgress(isCorrect);
    // 自动播自然音 (听完选项后)
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
    // 拆 chunks, 让用户按顺序点选 chunk 拼成原句
    const chunks = (s.audioSegmented || []).map((c, i) => ({
      idx: i,
      text: c.clearText,
      audioUrl: c.clearUrl,
      used: false,
    }));
    this.setData({ chunks });
  },

  onPlayWord(e) {
    const idx = e.currentTarget.dataset.idx;
    const c = this.data.chunks[idx];
    if (!c || !c.audioUrl) return;
    this._playAudio(c.audioUrl, `w:${idx}`);
  },

  onPickWord(e) {
    if (this.data.wordResult !== null) return;  // 已确认过
    const idx = e.currentTarget.dataset.idx;
    const selected = [...this.data.selectedWords, idx];
    this.setData({ selectedWords: selected });
    // 标记 chunk 已用
    const chunks = this.data.chunks.map(c => c.idx === idx ? { ...c, used: true } : c);
    this.setData({ chunks });
    // 自动播这个 chunk
    const c = chunks[idx];
    if (c) this._playAudio(c.audioUrl, `wp:${idx}`);
  },

  onUndoWord() {
    if (this.data.selectedWords.length === 0) return;
    const selected = [...this.data.selectedWords];
    const lastIdx = selected.pop();
    this.setData({ selectedWords: selected });
    const chunks = this.data.chunks.map(c => c.idx === lastIdx ? { ...c, used: false } : c);
    this.setData({ chunks });
  },

  onConfirmWords() {
    if (this.data.wordResult !== null) return;
    const s = this.data.pool[this.data.idx];
    const expectedOrder = (s.audioSegmented || []).map((_, i) => i);
    const isCorrect = JSON.stringify(this.data.selectedWords) === JSON.stringify(expectedOrder);
    this.setData({ wordResult: isCorrect ? 'correct' : 'wrong' });
    this._updateProgress(isCorrect);
  },

  onReplayWordsFull() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioNatural.url, `nf:${s.id}`);
  },

  // ============== mode 3: slow-vs-natural ==============

  _setupSlowNatural(s) {
    // 仅展示, 不需要 setData 特殊内容 (audio 按钮 + 文本对比在 wxml)
  },

  onPlayClear() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioClear.url, `c:${s.id}`);
  },

  onPlayNatural() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioNatural.url, `n:${s.id}`);
  },

  // ============== 公共 ==============

  _playAudio(url, tag) {
    if (!url) {
      wx.showToast({ title: '音频 URL 为空', icon: 'error' });
      return;
    }
    tts.speak(url, {
      onError: (e) => wx.showToast({ title: '播放失败', icon: 'none' }),
    });
  },

  _updateProgress(correct) {
    const p = { ...this.data.progress };
    p.done = this.data.idx + 1;
    if (correct) p.correct += 1;
    p.passRate = p.done === 0 ? 0 : Math.round(p.correct / p.done * 100);
    this.setData({ progress: p });
    // 存到 storage
    this._saveProgress(correct);
  },

  _saveProgress(correct) {
    try {
      const all = wx.getStorageSync(STORAGE_KEY) || {};
      const key = `${this.data.mode}:${this.data.lessonId || 'all'}`;
      const cur = all[key] || { total: 0, correct: 0, lastAt: null };
      all[key] = {
        total: cur.total + 1,
        correct: cur.correct + (correct ? 1 : 0),
        passRate: Math.round(((cur.correct + (correct ? 1 : 0)) / (cur.total + 1)) * 100),
        lastAt: new Date().toISOString(),
      };
      wx.setStorageSync(STORAGE_KEY, all);
    } catch (e) {
      console.warn('[train] saveProgress failed:', e);
    }
  },

  _finish() {
    this.setData({ finished: true });
    try { tts.stop && tts.stop(); } catch (e) {}
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
      title: `英语快充 · ${this.data.modeMeta ? this.data.modeMeta.name : '训练'}`,
      path: `/pages/natural/train?mode=${this.data.mode}${this.data.lessonId ? '&lesson=' + this.data.lessonId : ''}`,
    };
  },
});
