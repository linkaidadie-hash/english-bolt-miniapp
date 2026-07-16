// pages/review/review.js — 错题回炉
//
// 阶段三 MVP：
//   - 拉最近 100 条 trainingLog 里 quality=forgot 的去重
//   - 复用 trainer.buildReviewQuiz (用 listening 流程)
//   - 5 题一组（错题少于 5 时全跑）

const tts = require('../../utils/tts.js');
const srs = require('../../utils/srs.js');
const userData = require('../../utils/user-data.js');
const trainer = require('../../utils/trainer.js');

Page({
  data: {
    quiz: [],
    currentIndex: 0,
    selectedChoice: -1,
    showFeedback: false,
    isCorrect: false,
    audioStatus: 'ready',
    summary: null,
    startTime: 0,
  },

  onLoad() {
    const quiz = trainer.buildReviewQuiz(5);
    if (quiz.length === 0) {
      // 没有错题 → 显示空状态
      this.setData({ quiz: [], summary: { empty: true, total: 0, durationMs: 0 } });
      return;
    }
    this.setData({ quiz, currentIndex: 0, startTime: Date.now() });
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
    this.setData({ selectedChoice: e.currentTarget.dataset.idx });
  },

  onSubmit() {
    if (this.data.selectedChoice === -1) {
      wx.showToast({ title: '请先选一个', icon: 'none' });
      return;
    }
    const cur = this.data.quiz[this.data.currentIndex];
    const isCorrect = this.data.selectedChoice === cur.correctIndex;
    this.setData({ showFeedback: true, isCorrect });
    const quality = isCorrect ? 'remembered' : 'forgot';
    const result = srs.score(quality, userData.getWordProgress(cur.word.id));
    userData.setWordProgress(cur.word.id, {
      ...result.increment,
      status: result.status,
      dueAt: result.dueAt,
    });
    userData.pushTrainingLog({ type: 'review', wordId: cur.word.id, quality: result.quality });
  },

  onNext() {
    const next = this.data.currentIndex + 1;
    if (next >= this.data.quiz.length) {
      this.setData({ summary: { total: this.data.quiz.length, durationMs: Date.now() - this.data.startTime } });
      return;
    }
    tts.stop();
    this.setData({ currentIndex: next, selectedChoice: -1, showFeedback: false, isCorrect: false, audioStatus: 'ready' });
  },

  onBack() {
    tts.stop();
    wx.navigateBack();
  },

  onUnload() { tts.stop(); },
});
