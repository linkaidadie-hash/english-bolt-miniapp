// pages/today/today.js — 今日训练页
//
// 阶段一职责（极简 demo）：
//   - 展示 1 个 word 卡片（apple）
//   - 真实播放 CDN 音频，验证 tts.speak 链路
//   - 显示 "missing" 当音频不存在
//   - 显示当前 tts 状态 (idle/loading/playing/ended/error)
//
// 阶段二会替换为：今日任务列表 + 间隔复习引擎。
// 阶段三会替换为：到期复习 / 新词 / 听音辨词 / 自然口语解码 / 错题回炉。

const tts = require('../../utils/tts.js');
const cdn = require('../../utils/audio-cdn.js');
const userData = require('../../utils/user-data.js');

const DEMO_WORD = {
  id: 'demo-apple-001',
  word: 'apple',
  ipa: '/ˈæp.əl/',
  meaning: '苹果',
  pos: 'n.',
  scene: '日常',
  difficulty: 1,
};

Page({
  data: {
    word: DEMO_WORD,
    audioStatus: 'missing', // 'missing' | 'ready' | 'loading' | 'playing' | 'ended' | 'error'
    audioError: '',
    settings: null,
  },

  onLoad() {
    const audio = cdn.wordAudioUrl(DEMO_WORD.word);
    const settings = userData.get(userData.KEYS.settings);
    this.setData({
      audioStatus: audio.exists ? 'ready' : 'missing',
      settings,
    });

    // 订阅 tts 全局事件，更新 UI
    this._unsub = tts.onEvent((evt) => {
      const map = { play: 'playing', ended: 'ended', error: 'error' };
      const next = map[evt.type];
      if (next) {
        this.setData({ audioStatus: next, audioError: evt.error || '' });
      }
    });
  },

  onUnload() {
    if (this._unsub) this._unsub();
  },

  onPlayTap() {
    if (this.data.audioStatus === 'missing') {
      wx.showToast({ title: '音频缺失', icon: 'none' });
      return;
    }
    if (this.data.audioStatus === 'playing') {
      tts.stop();
      this.setData({ audioStatus: 'ready' });
      return;
    }
    const audio = cdn.wordAudioUrl(DEMO_WORD.word);
    this.setData({ audioStatus: 'loading', audioError: '' });
    tts.speak(audio.url, {
      onError: (e) => {
        this.setData({ audioStatus: 'error', audioError: e.error || '播放失败' });
      },
    });
  },

  onToggleSetting(e) {
    const key = e.currentTarget.dataset.key;
    const cur = this.data.settings || {};
    const next = { ...cur, [key]: !cur[key] };
    userData.set(userData.KEYS.settings, next);
    this.setData({ settings: next });
  },
});
