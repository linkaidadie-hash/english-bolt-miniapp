// pages/natural/sample-review.js — 阶段四 B 12 条样板内部验收页
//
// 内部使用, **不**对外开放, 不可作为训练入口。
//
// 功能:
//   - 12 条样板卡片, 每条提供 clear / natural 播放 + 切换播放
//   - 状态: pass / need-redo / pending, + 备注
//   - 验收结果存 wx.storage `natural-samples-review-v1`
//   - 顶部进度 + 保存按钮 (一键写回 storage)
//
// 路由: 通过自然首页底部 "🔧 内部验收" 链接进入 (开发期间)
//      或直接 wx.navigateTo 到 /pages/natural/sample-review

const tts = require('../../utils/tts.js');
const naturalData = require('../../utils/natural-data.js');

const STORAGE_KEY = 'natural-samples-review-v1';
const PASS = 'pass';
const REDO = 'need-redo';
const PENDING = 'pending';

Page({
  data: {
    samples: [],
    reviewMap: {},           // { sentenceId: { status, notes, reviewedAt } }
    progress: { total: 0, pass: 0, redo: 0, pending: 0 },
    saveStatus: 'idle',      // idle | saved | error
    lastSaveAt: null,
  },

  onLoad() {
    this._loadSamples();
    this._loadReview();
  },

  onShow() {
    this._loadReview();
  },

  onUnload() {
    // 离开页时停掉所有音频
    try { tts.stop && tts.stop(); } catch (e) {}
  },

  _loadSamples() {
    // 12 条样板从 data/natural-samples-12.json 取? 这里直接读 (项目期, 数据静态)
    // 实际通过 require (wx 不支持 fs, 但在 build 时把 samples 也打包成 js)
    // 简化: 从 naturalData 找 audioReady 的句子, 取前 12 条
    const lessons = naturalData.getAllLessons();
    const samples = [];
    for (const l of lessons) {
      for (const s of l.sentences) {
        if (s.audioClear.status === 'ready' && s.audioNatural.status === 'ready') {
          samples.push({
            lessonId: l.id,
            sentenceId: s.id,
            category: l.icon,
            categoryName: l.name,
            writtenText: s.writtenText,
            naturalText: s.naturalText,
            clearText: s.clearText,
            pronunciationNotes: s.pronunciationNotes,
            audioClearUrl: s.audioClear.url,
            audioNaturalUrl: s.audioNatural.url,
            audioClearSize: s.audioClear.size,
            audioNaturalSize: s.audioNatural.size,
          });
        }
      }
      if (samples.length >= 12) break;
    }
    this.setData({ samples });
  },

  _loadReview() {
    try {
      const stored = wx.getStorageSync(STORAGE_KEY) || {};
      this.setData({ reviewMap: stored, lastSaveAt: stored._lastSaveAt || null });
      this._recomputeProgress();
    } catch (e) {
      console.warn('[review] load review from storage failed:', e);
    }
  },

  _recomputeProgress() {
    const samples = this.data.samples;
    const reviewMap = this.data.reviewMap;
    let pass = 0, redo = 0, pending = 0;
    for (const s of samples) {
      const r = reviewMap[s.sentenceId];
      const st = (r && r.status) || PENDING;
      if (st === PASS) pass++;
      else if (st === REDO) redo++;
      else pending++;
    }
    this.setData({ progress: { total: samples.length, pass, redo, pending } });
  },

  onPlayClear(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.data.samples.find(x => x.sentenceId === id);
    if (!s) return;
    this._play(s.audioClearUrl, `clear:${id}`);
  },

  onPlayNatural(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.data.samples.find(x => x.sentenceId === id);
    if (!s) return;
    this._play(s.audioNaturalUrl, `natural:${id}`);
  },

  onTogglePlay(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.data.samples.find(x => x.sentenceId === id);
    if (!s) return;
    // 切换: 上次播 clear 这次播 natural, 反之亦然
    if (this._lastPlay && this._lastPlay.id === id && this._lastPlay.version === 'clear') {
      this._play(s.audioNaturalUrl, `natural:${id}`);
    } else {
      this._play(s.audioClearUrl, `clear:${id}`);
    }
  },

  _play(url, tag) {
    if (!url) {
      wx.showToast({ title: '音频 URL 为空', icon: 'error' });
      return;
    }
    // 记上次播放
    const id = tag.split(':')[1];
    const version = tag.split(':')[0];
    this._lastPlay = { id, version };
    tts.speak(url, {
      onPlay:  () => {},
      onEnded: () => {},
      onError: (e) => wx.showToast({ title: '播放失败: ' + (e?.message || e), icon: 'none' }),
    });
  },

  onSetStatus(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    const reviewMap = { ...this.data.reviewMap };
    const cur = reviewMap[id] || { status: PENDING, notes: '' };
    reviewMap[id] = { ...cur, status, reviewedAt: new Date().toISOString() };
    this.setData({ reviewMap });
    this._recomputeProgress();
  },

  onNotesInput(e) {
    const id = e.currentTarget.dataset.id;
    const notes = e.detail.value;
    const reviewMap = { ...this.data.reviewMap };
    const cur = reviewMap[id] || { status: PENDING, notes: '' };
    reviewMap[id] = { ...cur, notes };
    this.setData({ reviewMap });
  },

  onSave() {
    try {
      const reviewMap = { ...this.data.reviewMap, _lastSaveAt: new Date().toISOString() };
      wx.setStorageSync(STORAGE_KEY, reviewMap);
      this.setData({ reviewMap, saveStatus: 'saved', lastSaveAt: reviewMap._lastSaveAt });
      wx.showToast({ title: '已保存', icon: 'success', duration: 1200 });
    } catch (e) {
      this.setData({ saveStatus: 'error' });
      wx.showToast({ title: '保存失败: ' + (e?.message || e), icon: 'none' });
    }
  },

  onClear() {
    wx.showModal({
      title: '清空验收结果',
      content: '将删除所有 12 条样板的人工验收记录, 此操作不可撤销',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync(STORAGE_KEY);
          this.setData({ reviewMap: {}, lastSaveAt: null });
          this._recomputeProgress();
        }
      },
    });
  },

  onExport() {
    const data = {
      exportedAt: new Date().toISOString(),
      buildTag: 'phase4b-samples-12-2026-07-17',
      review: this.data.reviewMap,
    };
    const text = JSON.stringify(data, null, 2);
    // 写到剪贴板, 方便贴给 user
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' }),
    });
  },
});
