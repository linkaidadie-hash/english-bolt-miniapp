// pages/mine/mine.js — 我的页（阶段一：基础统计 + 设置）
const userData = require('../../utils/user-data.js');
const tts = require('../../utils/tts.js');

Page({
  data: {
    stats: { vocab: 0, listen: 0, naturalListen: 0, speak: 0, scenesPassed: 0 },
    settings: null,
    buildTag: getApp().globalData.buildTag,
  },
  onShow() {
    this.setData({ settings: userData.get(userData.KEYS.settings) });
  },
  onTapTestAudio() {
    tts.speak('https://english.wujiong.cn/audio/apple.mp3', {
      onPlay:  () => wx.showToast({ title: 'playing', icon: 'none', duration: 600 }),
      onEnded: () => wx.showToast({ title: 'ended',    icon: 'none', duration: 600 }),
      onError: (e) => wx.showToast({ title: 'err: ' + e.error, icon: 'none' }),
    });
  },
});
