// pages/mine/mine.js — 我的页（阶段三升级：5 维度统计）
const userData = require('../../utils/user-data.js');
const srs = require('../../utils/srs.js');
const tts = require('../../utils/tts.js');

Page({
  data: {
    stats: { known: 0, listen: 0, naturalListen: 0, speak: 0, spell: 0, mastered: 0, total: 0 },
    trainingCount: 0,
    settings: null,
    buildTag: getApp().globalData.buildTag,
  },
  onShow() {
    this._refreshStats();
    this.setData({ settings: userData.get(userData.KEYS.settings) });
  },
  _refreshStats() {
    const wp = userData.get(userData.KEYS.wordProgress);
    const stats = srs.computeStats(wp);
    const log = userData.getTrainingLog();
    this.setData({ stats, trainingCount: log.history.length });
  },
  onTestAudio() {
    tts.speak('https://english.wujiong.cn/audio/apple.mp3', {
      onPlay:  () => wx.showToast({ title: 'playing', icon: 'none', duration: 600 }),
      onEnded: () => wx.showToast({ title: 'ended',    icon: 'none', duration: 600 }),
      onError: (e) => wx.showToast({ title: 'err: ' + e.error, icon: 'none' }),
    });
  },
  onReset() {
    wx.showModal({
      title: '重置学习进度',
      content: '清空所有 wordProgress / 训练 log？此操作不可恢复。',
      success: (r) => {
        if (r.confirm) {
          userData.set(userData.KEYS.wordProgress, {});
          userData.set(userData.KEYS.trainingLog, { history: [] });
          this._refreshStats();
          wx.showToast({ title: '已重置', icon: 'success' });
        }
      },
    });
  },
});
