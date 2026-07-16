// pages/mine/mine.js — 我的页（阶段三：只读汇总）
const userData = require('../../utils/user-data.js');
const srs = require('../../utils/srs.js');

Page({
  data: {
    stats: { known: 0, listen: 0, naturalListen: 0, speak: 0, spell: 0, mastered: 0, total: 0 },
    trainingCount: 0,
    buildTag: getApp().globalData.buildTag,
  },
  onShow() {
    this._refreshStats();
  },
  _refreshStats() {
    const wp = userData.get(userData.KEYS.wordProgress);
    const stats = srs.computeStats(wp);
    const log = userData.getTrainingLog();
    this.setData({ stats, trainingCount: log.history.length });
  },
});
