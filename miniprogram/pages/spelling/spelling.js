// pages/spelling/spelling.js — 拼写检测训练
//
// 阶段三 MVP：
//   - 仅 830 ready 词
//   - 10 题
//   - 显示中文释义 + IPA → user 输入
//   - 大小写不敏感 / 拼写允许 1 字符 typo（vague）

const trainer = require('../../utils/trainer.js');
const srs = require('../../utils/srs.js');
const userData = require('../../utils/user-data.js');

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

Page({
  data: {
    quiz: [],
    currentIndex: 0,
    inputValue: '',
    showFeedback: false,
    isCorrect: false,
    quality: '',         // 'forgot' | 'vague' | 'remembered'
    summary: null,
    startTime: 0,
  },

  onLoad() {
    const quiz = trainer.buildSpellingQuiz(10);
    this.setData({ quiz, currentIndex: 0, inputValue: '', startTime: Date.now() });
  },

  onInput(e) {
    if (this.data.showFeedback) return;
    this.setData({ inputValue: e.detail.value });
  },

  onSubmit() {
    const cur = this.data.quiz[this.data.currentIndex];
    if (!cur) return;
    const userInput = (this.data.inputValue || '').trim().toLowerCase();
    const expected = cur.expected.toLowerCase();
    let quality;
    if (userInput === expected) {
      quality = 'remembered';
    } else {
      const dist = levenshtein(userInput, expected);
      // 长词 (>=6 字符) 允许 1 typo → vague；否则 forgot
      quality = (expected.length >= 6 && dist <= 1) ? 'vague' : 'forgot';
    }
    const isCorrect = quality === 'remembered';
    this.setData({ showFeedback: true, isCorrect, quality });

    const result = srs.score(quality, userData.getWordProgress(cur.wordId));
    userData.setWordProgress(cur.wordId, {
      ...result.increment,
      spell: isCorrect ? 1 : 0,  // spell 只算完全对
      status: result.status,
      dueAt: result.dueAt,
    });
    userData.pushTrainingLog({
      type: 'spelling',
      wordId: cur.wordId,
      quality: result.quality,
    });
  },

  onNext() {
    const next = this.data.currentIndex + 1;
    if (next >= this.data.quiz.length) {
      this.setData({ summary: { total: this.data.quiz.length, durationMs: Date.now() - this.data.startTime } });
      return;
    }
    this.setData({ currentIndex: next, inputValue: '', showFeedback: false, isCorrect: false, quality: '' });
  },

  onBack() {
    wx.navigateBack();
  },
});
