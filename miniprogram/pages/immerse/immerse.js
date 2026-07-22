// pages/immerse/immerse.js — 沉浸频道 (阶段五: 后台播放)
//
// 10 频道 + BackgroundAudioManager:
//   - 切后台 / 锁屏继续播放
//   - 暂停 / 继续 / 上一首 / 下一首
//   - 进度恢复 (切频道时保存)
//   - 定时停止 (10/20/30/60 min)
//   - 网络中断恢复 (3s 后重连)

const player = require('../../utils/background-audio.js');
const channels = require('../../utils/audio-channels.js');

const SLEEP_OPTIONS = [
  { label: '关闭', minutes: 0 },
  { label: '10 分钟', minutes: 10 },
  { label: '20 分钟', minutes: 20 },
  { label: '30 分钟', minutes: 30 },
  { label: '60 分钟', minutes: 60 },
];

Page({
  data: {
    channelList: [],
    current: null,         // { channel, title, idx }
    state: 'idle',          // idle | loading | playing | paused | stopped | error
    position: 0,
    duration: 0,
    showSleepSheet: false,
    sleepOptions: SLEEP_OPTIONS,
    currentSleep: null,     // remainMs
    showChannelList: true,
    channelLabel: '',
  },

  onLoad() {
    const channelList = channels.listChannels();
    this.setData({ channelList });
    this._unsub = player.onEvent((evt) => this._onPlayerEvent(evt));
  },

  _channelLabel(id) {
    const c = channels.getChannel(id);
    return c ? `${c.icon} ${c.name}` : id;
  },

  onShow() {
    this._refresh();
  },

  onUnload() {
    if (this._unsub) this._unsub();
  },

  onHide() {
    // 不 stop, 让后台继续
  },

  _refresh() {
    const st = player.getState();
    const channelLabel = st.current ? this._channelLabel(st.current.channel) : '';
    this.setData({
      current: st.current,
      state: st.state,
      channelLabel,
    });
    // 恢复 sleep timer
    const t = player.getSleepTimer();
    if (t && t.remainMs > 0) {
      this.setData({ currentSleep: t.remainMs });
    } else {
      this.setData({ currentSleep: null });
    }
  },

  _onPlayerEvent(evt) {
    if (evt.type === 'change' || evt.type === 'play' || evt.type === 'pause' || evt.type === 'stop' || evt.type === 'ended' || evt.type === 'error') {
      this._refresh();
    } else if (evt.type === 'timeupdate') {
      this.setData({ position: evt.position, duration: evt.duration });
    } else if (evt.type === 'timer') {
      this.setData({ currentSleep: evt.remainMs });
    }
  },

  // === 频道操作 ===
  onPickChannel(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const playlist = channels.getPlaylist(id);
    if (!playlist || playlist.length === 0) {
      wx.showToast({ title: '该频道暂无内容', icon: 'none' });
      return;
    }
    player.playChannel(id, playlist, 0);
    this.setData({ showChannelList: false });
  },

  onBackToChannels() {
    this.setData({ showChannelList: true });
  },

  // === 播放控制 ===
  onTogglePlay() {
    const st = player.getState();
    if (!st.current) return;
    if (st.state === 'playing') {
      player.pause();
    } else if (st.state === 'paused' || st.state === 'loading' || st.state === 'ended') {
      player.resume();
    }
  },

  onNext() {
    player.next();
  },

  onPrev() {
    player.prev();
  },

  onStop() {
    player.stop();
    this.setData({ showChannelList: true });
  },

  onSeek(e) {
    const v = e.detail.value;
    player.seek(v);
    this.setData({ position: v });
  },

  // === 定时 ===
  onOpenSleep() {
    this.setData({ showSleepSheet: true });
  },

  onCloseSleep() {
    this.setData({ showSleepSheet: false });
  },

  onPickSleep(e) {
    const minutes = parseInt(e.currentTarget.dataset.m, 10);
    player.setSleepTimer(minutes);
    this.setData({ showSleepSheet: false });
  },

  onClearSleep() {
    player.setSleepTimer(0);
    this.setData({ showSleepSheet: false, currentSleep: null });
  },

  // 格式化
  fmtTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  },
});
