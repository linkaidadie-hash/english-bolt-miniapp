// pages/today/today.js — 今日训练页（阶段二 MVP）
//
// 阶段二职责：
//   - 加载 data-repository
//   - 拉今日 10 个词 (level 1-3 优先)
//   - 支持左右切词（按 ←/→ 或触屏滑动）
//   - 真实播放 audio（缺失标 missing）
//   - 保留阶段一的所有设置/播放
//
// 阶段三扩展：到期间隔复习 / 听音辨词 / 自然口语解码 / 错题回炉
//
// 阶段八性能优化 (2026-07-20):
//   - 骨架优先: onLoad 立即 setData({ loading: true }), 显示骨架
//   - then setTimeout(0) 异步加载 batch + audioStats, 完整数据再 setData
//   - 避免 1MB 词库同步迭代导致首屏卡顿

const tts = require('../../utils/tts.js');
const cdn = require('../../utils/audio-cdn.js');
const repo = require('../../utils/data-repository.js');
const userData = require('../../utils/user-data.js');

Page({
  data: {
    meta: null,
    audioStats: null,
    batch: null,             // { date, size, review, fresh, words }
    currentIndex: 0,         // 0..size-1
    currentWord: null,
    audioStatus: 'missing',  // 'missing' | 'ready' | 'loading' | 'playing' | 'ended' | 'error'
    audioError: '',
    settings: null,
    naturalStatus: '',       // 阶段四 B: 180 句 audio ready 状态
    loading: true,           // 阶段八: 首屏骨架标志
  },

  onLoad() {
    // 阶段八: 立即显示骨架 (元数据已就绪, batch 待异步加载)
    this.setData({ meta: repo.getMeta(), loading: true });
    const settings = userData.get(userData.KEYS.settings);
    this.setData({ settings });

    // 阶段四 B: 自然口语 ready 状态 (轻量, 同步可读)
    let naturalStatus = '';
    try {
      const naturalData = require('../../utils/natural-data.js');
      const sum = naturalData.getAudioStatusSummary();
      naturalStatus = `已就绪 ${sum.audioReady}/${sum.total} 句 (${sum.audioReadyPct}%)`;
    } catch (e) {
      naturalStatus = '自然口语模块未加载';
    }
    this.setData({ naturalStatus });

    // 异步加载完整数据 (词库索引走 setTimeout(0), 不阻塞首屏)
    setTimeout(() => {
      try {
        const audioStats = repo.getAudioStats();
        const batch = repo.getTodayBatch({ size: 10, preferLevels: [1, 2, 3] });
        this.setData({
          audioStats,
          batch,
          currentWord: batch.words[0] || null,
          currentIndex: 0,
          loading: false,
        });
        if (batch.words[0]) this._refreshCurrentAudio();
      } catch (e) {
        console.warn('[today] async load failed:', e?.message || e);
        this.setData({ loading: false });
      }
    }, 0);

    this._unsub = tts.onEvent((evt) => {
      const map = { play: 'playing', ended: 'ended', error: 'error' };
      const next = map[evt.type];
      if (next) this.setData({ audioStatus: next, audioError: evt.error || '' });
    });
  },

  onUnload() {
    if (this._unsub) this._unsub();
  },

  _refreshCurrentAudio() {
    const w = this.data.currentWord;
    if (!w) {
      this.setData({ audioStatus: 'missing' });
      return;
    }
    const audio = cdn.wordAudio(w);
    this.setData({
      audioStatus: audio.exists ? (audio.kind === 'spell' ? 'ready_spell' : (audio.kind === 'chinese' ? 'ready_chinese' : 'ready')) : 'missing',
      audioError: '',
    });
  },

  // === 控制：上一词 / 下一词 ===
  onPrev() {
    if (this.data.currentIndex <= 0) return;
    tts.stop();
    const idx = this.data.currentIndex - 1;
    this.setData({ currentIndex: idx, currentWord: this.data.batch.words[idx] });
    this._refreshCurrentAudio();
  },

  onNext() {
    const max = (this.data.batch?.words?.length || 0) - 1;
    if (this.data.currentIndex >= max) return;
    tts.stop();
    const idx = this.data.currentIndex + 1;
    this.setData({ currentIndex: idx, currentWord: this.data.batch.words[idx] });
    this._refreshCurrentAudio();
  },

  // === 播放 ===
  onPlayTap() {
    if (this.data.audioStatus === 'missing') {
      wx.showToast({ title: '发音待补充', icon: 'none' });
      return;
    }
    if (this.data.audioStatus === 'playing') {
      tts.stop();
      this.setData({ audioStatus: this._idleStatus() });
      return;
    }
    // 兜底：cdn 再查一次 + exists 守门
    const audio = cdn.wordAudio(this.data.currentWord);
    if (!audio || !audio.exists || !audio.url) {
      wx.showToast({ title: '发音待补充', icon: 'none' });
      this.setData({ audioStatus: 'missing' });
      return;
    }
    this.setData({ audioStatus: 'loading', audioError: '' });
    tts.speak(audio.url, {
      onError: (e) => this.setData({ audioStatus: 'error', audioError: e.error || '播放失败' }),
    });
  },

  _idleStatus() {
    const w = this.data.currentWord;
    if (!w) return 'missing';
    if (w.audio?.status === 'ready') return 'ready';
    if (w.audio?.status === 'ready_spell') return 'ready_spell';
    if (w.audio?.status === 'ready_chinese') return 'ready_chinese';
    return 'missing';
  },

  // === 设置项切换 ===
  onToggleSetting(e) {
    const key = e.currentTarget.dataset.key;
    const cur = this.data.settings || {};
    const next = { ...cur, [key]: !cur[key] };
    userData.set(userData.KEYS.settings, next);
    this.setData({ settings: next });
  },

  // === 跳到指定词（点击词列表） ===
  onJumpTo(e) {
    const idx = e.currentTarget.dataset.idx;
    if (idx === this.data.currentIndex) return;
    tts.stop();
    this.setData({ currentIndex: idx, currentWord: this.data.batch.words[idx] });
    this._refreshCurrentAudio();
  },

  // === 阶段三：训练入口 ===
  onGoListening() {
    tts.stop();
    wx.navigateTo({ url: '/pages/listening/listening' });
  },
  onGoSpelling() {
    wx.navigateTo({ url: '/pages/spelling/spelling' });
  },
  onGoReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  },
  onOpenNatural(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/natural/lesson?id=${encodeURIComponent(id)}` });
  },
});
