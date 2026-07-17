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
    desc: '听自然版, 把听到的慢速分段按正确顺序拼成原句。训练意群分割 + 单词识别。',
  },
  'slow-vs-natural': {
    name: '慢速 vs 自然',
    icon: '⚖️',
    desc: '对比慢速与自然两版音频, 看 IPA 差异与变化点, 理解自然语速发生了什么。',
  },
};

const STORAGE_KEY = 'natural-train-progress-v1';
const WRONG_KEY = 'natural-train-wrong-v1';  // 错题记录
const POOL_SIZE = 10;
const PASS_THRESHOLD = 0.7;

Page({
  data: {
    mode: null,
    modeMeta: null,
    lessonId: null,
    pool: [],
    idx: 0,
    progress: { done: 0, total: 0, correct: 0, passRate: 0 },
    finished: false,

    // listen-and-guess state
    options: [],
    picked: null,
    correctIdx: null,
    guessResult: null,

    // sound-to-words state
    chunks: [],
    selectedWords: [],
    wordResult: null,
    correctOrder: [],   // 正确顺序下标 (init 时锁定, 提交后用来标记错位)
    wrongPositions: [], // 提交后标记错位的下标 [userIdxInSelected]

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
    this.setData({ mode, modeMeta: MODES[mode], lessonId });
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
    const shuffled = this._shuffle([...allSentences]);
    const poolSize = Math.min(POOL_SIZE, allSentences.length);
    this.setData({
      pool: shuffled.slice(0, poolSize),
      audioReady: true,
      progress: { done: 0, total: poolSize, correct: 0, passRate: 0 },
    });
  },

  /**
   * Fisher-Yates 洗牌
   * - 不使用 sort(Math.random) (这种实现有偏)
   * - 保证洗牌结果不等于原顺序
   * - 2 个块时必互换
   * - 3+ 个块时至少 2 位置变化
   */
  _shuffle(arr) {
    const n = arr.length;
    if (n <= 1) return arr;
    const original = [...arr];
    for (let attempt = 0; attempt < 20; attempt++) {
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      if (this._shuffleValid(original, arr)) {
        return arr;
      }
    }
    // 兜底: 旋转一位 (n>=2 时必变化)
    arr.push(arr.shift());
    if (n === 1) arr[0] = arr[0];
    return arr;
  },

  _shuffleValid(original, shuffled) {
    const n = original.length;
    if (n === 1) return false;
    if (n === 2) {
      // 2 块: 必互换
      return shuffled[0] !== original[0] && shuffled[1] !== original[1];
    }
    // n >= 3: 至少 2 位置变化
    let diffCount = 0;
    for (let i = 0; i < n; i++) {
      if (original[i] !== shuffled[i]) diffCount++;
    }
    return diffCount >= 2;
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
      wrongPositions: [],
    });
    switch (this.data.mode) {
      case 'listen-and-guess': return this._setupGuess(s);
      case 'sound-to-words':   return this._setupWords(s);
      case 'slow-vs-natural':  return this._setupSlowNatural(s);
    }
  },

  // ============== mode 1: listen-and-guess ==============

  _setupGuess(s) {
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
    if (this.data.picked !== null) return;
    const idx = e.currentTarget.dataset.idx;
    const isCorrect = idx === this.data.correctIdx;
    this.setData({
      picked: idx,
      guessResult: isCorrect ? 'correct' : 'wrong',
    });
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

  /**
   * 关键修复:
   *   - chunks 顺序打乱 (Fisher-Yates, 不等于原顺序, 至少 2 位置变化)
   *   - selectedWords 初始为空 (用户从未"按原顺序"展示)
   *   - correctOrder 锁住, 提交后用来标记错位
   */
  _setupWords(s) {
    // 1. 准备所有 chunks (按 audioSegmented 数组)
    const segs = s.audioSegmented || [];
    const allChunks = segs.map((c, i) => ({
      idx: i,             // 原始下标 (0, 1, 2, ...) — 用于判断顺序
      text: c.clearText,
      audioUrl: c.clearUrl,
      naturalUrl: c.naturalUrl,
      used: false,
    }));

    // 2. 打乱 chunk 显示顺序 (洗牌, 至少 2 位置变化)
    const shuffled = this._shuffle([...allChunks]);
    // shuffled 现在是打乱后的 chunk 数组
    // 但是 selectedWords 用"原始下标"标识, 所以原 idx 不变, 只换显示位置

    // 3. 锁定正确顺序
    const correctOrder = allChunks.map((_, i) => i);

    this.setData({
      chunks: shuffled,
      correctOrder,
    });
  },

  /**
   * 撤回: 弹出最后选的一个
   */
  onUndoWord() {
    if (this.data.wordResult !== null) return;  // 已提交, 不让改
    if (this.data.selectedWords.length === 0) return;
    const selected = [...this.data.selectedWords];
    const lastOriginalIdx = selected.pop();
    this.setData({ selectedWords: selected });
    const chunks = this.data.chunks.map(c => c.idx === lastOriginalIdx ? { ...c, used: false } : c);
    this.setData({ chunks });
  },

  /**
   * 清空: 重置所有 selected
   */
  onClearWords() {
    if (this.data.wordResult !== null) return;
    this.setData({ selectedWords: [] });
    const chunks = this.data.chunks.map(c => ({ ...c, used: false }));
    this.setData({ chunks });
  },

  /**
   * 提交: 检查顺序
   *   - 正确: wordResult = 'correct', 推进 progress
   *   - 错误: 标记每个错位 (selectedWords[i] !== correctOrder[i])
   *   - 错题写入 storage
   *   - 错题时自动播 natural + 显示变化点 (在 wxml 中根据 wordResult === 'wrong' 显示)
   */
  onConfirmWords() {
    if (this.data.wordResult !== null) return;
    if (this.data.selectedWords.length !== this.data.chunks.length) return;

    const s = this.data.pool[this.data.idx];
    const correctOrder = this.data.correctOrder;
    const selected = this.data.selectedWords;
    const wrongPositions = [];
    for (let i = 0; i < selected.length; i++) {
      if (selected[i] !== correctOrder[i]) wrongPositions.push(i);
    }
    const isCorrect = wrongPositions.length === 0;
    this.setData({
      wordResult: isCorrect ? 'correct' : 'wrong',
      wrongPositions,
    });
    this._updateProgress(isCorrect);
    if (!isCorrect) {
      this._recordWrong(s);
    }
  },

  _recordWrong(s) {
    try {
      const all = wx.getStorageSync(WRONG_KEY) || {};
      const key = `${this.data.mode}:${this.data.lessonId || 'all'}`;
      const cur = all[key] || { items: [] };
      // 去重: 同一句只记一次
      if (!cur.items.find(x => x.sentenceId === s.id)) {
        cur.items.push({
          lessonId: s.lessonId,
          sentenceId: s.id,
          clearText: s.clearText,
          naturalText: s.naturalText,
          wrongAt: new Date().toISOString(),
        });
        all[key] = cur;
        wx.setStorageSync(WRONG_KEY, all);
      }
    } catch (e) {
      console.warn('[train] recordWrong failed:', e);
    }
  },

  /**
   * 单块点击: 点选 + 标记 used + 播这段
   * 关键改进:
   *   1. _pickingGuard 防快速重复点击
   *   2. 同步 setData 视觉反馈 (不等 audio)
   *   3. 第一次点选前 await prewarm (避免 interrupted)
   */
  onPickWord(e) {
    if (this.data.wordResult !== null) return;  // 已提交, 不让改
    if (this._pickingGuard) return;  // 防抖
    this._pickingGuard = true;
    setTimeout(() => { this._pickingGuard = false; }, 80);  // 80ms 解锁

    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    if (isNaN(idx)) return;
    const c = this.data.chunks[idx];
    if (!c || c.used) return;  // 已用

    // 1) 同步视觉反馈 (不等 audio) — 让 user 立即看到点中
    const selected = [...this.data.selectedWords, idx];
    this.setData({ selectedWords: selected });
    const chunks = this.data.chunks.map((cc, i) => i === idx ? { ...cc, used: true } : cc);
    this.setData({ chunks });

    // 2) 异步播该段, 不阻塞
    if (c.audioUrl) {
      // 第一次点选前先确保 prewarm 完成 (避免第一次 interrupted)
      if (!this._prewarmed) {
        this._prewarmed = true;
        tts.prewarm().finally(() => this._playAudio(c.audioUrl, `wp:${idx}`));
      } else {
        this._playAudio(c.audioUrl, `wp:${idx}`);
      }
    }
  },

  /**
   * 长按 chunk: 单独听该段, 不点选
   */
  onPlayWordOnly(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const c = this.data.chunks[idx];
    if (!c || !c.audioUrl) return;
    this._playAudio(c.audioUrl, `w:${idx}`);
  },

  /**
   * 自然整句 + 变化点 (sound-to-words 完成后)
   */
  onReplayNatural() {
    const s = this.data.pool[this.data.idx];
    this._playAudio(s.audioNatural.url, `nf:${s.id}`);
  },

  // ============== mode 3: slow-vs-natural ==============

  _setupSlowNatural(s) {
    // 仅展示, 不需要 setData 特殊内容
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
