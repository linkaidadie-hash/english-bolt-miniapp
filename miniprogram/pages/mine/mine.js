// pages/mine/mine.js — 我的页 (阶段八 完整版)
const userData = require('../../utils/user-data.js');
const srs = require('../../utils/srs.js');

Page({
  data: {
    stats: { known: 0, listen: 0, naturalListen: 0, speak: 0, spell: 0, mastered: 0, total: 0 },
    trainingCount: 0,
    buildTag: getApp().globalData.buildTag,
    storageStats: null,
    sceneDone: 0,
    sceneTotal: 16,
    taskStreak: 0,
  },

  onShow() {
    this._refreshStats();
  },

  _refreshStats() {
    const wp = userData.get(userData.KEYS.wordProgress);
    const stats = srs.computeStats(wp);
    const log = userData.getTrainingLog();
    const storageStats = userData.getStorageStats();
    const sceneAll = userData.get(userData.KEYS.sceneProgress);
    const sceneDone = Object.keys(sceneAll || {}).length;
    const taskHist = userData.getTaskHistory();
    const taskStreak = taskHist?.streak || 0;
    this.setData({
      stats,
      trainingCount: log.history.length,
      storageStats,
      sceneDone,
      sceneTotal: 16,
      taskStreak,
    });
  },

  onGoTask() {
    wx.navigateTo({ url: '/pages/task/task' });
  },

  onGoAbout() {
    wx.navigateTo({ url: '/pages/settings/about' });
  },

  onGoPrivacy() {
    wx.navigateTo({ url: '/pages/settings/privacy' });
  },

  onGoRecordPerm() {
    wx.navigateTo({ url: '/pages/settings/record-permission' });
  },

  onGoReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  },

  async onClearData() {
    const ok = await userData.confirmClearAll();
    if (ok) {
      wx.showToast({ title: '已清除', icon: 'success' });
      this._refreshStats();
    }
  },
});
