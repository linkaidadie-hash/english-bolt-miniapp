// pages/immerse/immerse.js — 沉浸频道（阶段一占位）
const tts = require('../../utils/tts.js');
const userData = require('../../utils/user-data.js');

Page({
  data: {
    channels: [
      { id: 'today',    name: '今日已学',     desc: '阶段三实现' },
      { id: 'weak',     name: '弱读专项',     desc: '阶段四实现' },
      { id: 'link',     name: '连读专项',     desc: '阶段四实现' },
      { id: 'flap',     name: '美式闪音',     desc: '阶段四实现' },
      { id: 'scene',    name: '场景对话',     desc: '阶段六实现' },
      { id: 'pure-en',  name: '纯英文沉浸',   desc: '阶段五实现' },
    ],
    settings: null,
  },
  onLoad() {
    this.setData({ settings: userData.get(userData.KEYS.settings) });
  },
  onUnload() { /* 阶段五要切频道时再实现 stop + 重建 */ },
});
