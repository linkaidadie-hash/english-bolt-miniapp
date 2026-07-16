// pages/listening/listening.js — 听音辨词训练
//
// 阶段三 MVP：
//   - 仅 830 ready 词
//   - 10 题 / 4 选 1
//   - 5 档评分（forgot/vague/remembered/proficient/fluent）
//   - 自动记 wordProgress + push trainingLog
//   - SRS 算下次 due
//
// 阶段四扩展：自然口语音频（弱读/连读）+ 跟读。

const tts = require('../../utils/tts.js');
const cdn = require('../../utils/audio-cdn.js');
const trainer = require('../../utils/trainer.js');
const srs = require('../../utils/srs.js');
const userData = require('../../utils/user-data.js');

const QUALITY_LABELS = {
  forgot:     '完全忘记',
  vague:      '模糊',
  remembered: '基本记住',
  proficient: '熟练',
  fluent:     '能听会说',
};

Page({
  data: {
    quiz: [],
    currentIndex: 0,
    selectedChoice: -1,
    showFeedback: false,
    isCorrect: false,
    audioStatus: 'ready',
    summary: null,        // 完成后统计
    startTime: 0,
  },

  onLoad() {
    const quiz = trainer.buildListeningQuiz(10);
    this.setData({ quiz, currentIndex: 0, selectedChoice: -1, startTime: Date.now() });
  },

  onPlayAudio() {
    const cur = this.data.quiz[this.data.currentIndex];
    if (!cur || cur.word.audio.status !== 'ready') return;
    this.setData({ audioStatus: 'loading' });
    tts.speak(cur.word.audio.url, {
      onPlay:  () => this.setData({ audioStatus: 'playing' }),
      onEnded: () => this.setData({ audioStatus: 'ended' }),
      onError: (e) => this.setData({ audioStatus: 'error' }),
    });
  },

  onSelectChoice(e) {
    if (this.data.showFeedback) return;
    const idx = e.currentTarget.dataset.idx;
    this.setData({ selectedChoice: idx });
  },

  onSubmit() {
    if (this.data.selectedChoice === -1) {
      wx.showToast({ title: '请先选一个', icon: 'none' });
      return;
    }
    const cur = this.data.quiz[this.data.currentIndex];
    const isCorrect = this.data.selectedChoice === cur.correctIndex;
    this.setData({ showFeedback: true, isCorrect });

    // 阶段三 MVP：自动评分 remembered（简单二元 — 对就对，full SRS 留阶段四）
    const quality = isCorrect ? 'remembered' : 'forgot';
    const result = srs.score(quality, userData.getWordProgress(cur.word.id));
    userData.setWordProgress(cur.word.id, {
      ...result.increment,           // exposure + recall
      listen: isCorrect ? 1 : 0,      // 听音维度增量
      status: result.status,
      dueAt: result.dueAt,
    });
    userData.pushTrainingLog({
      type: 'listening',
      wordId: cur.word.id,
      quality: result.quality,
    });
  },

  onNext() {
    const next = this.data.currentIndex + 1;
    if (next >= this.data.quiz.length) {
      this._finish();
      return;
    }
    tts.stop();
    this.setData({ currentIndex: next, selectedChoice: -1, showFeedback: false, isCorrect: false, audioStatus: 'ready' });
  },

  _finish() {
    const correct = this.data.quiz.filter((q, i) => {
      // 已记进 wordProgress 的 recall 增量
      return true; // 简化：详细在训练 log
    });
    this.setData({ summary: { total: this.data.quiz.length, durationMs: Date.now() - this.data.startTime } });
  },

  onQuality(e) {
    // 阶段三：quality 由 submit 决定，不在 UI 多选
  },

  onBack() {
    tts.stop();
    wx.navigateBack();
  },

  onUnload() {
    tts.stop();
  },
});
