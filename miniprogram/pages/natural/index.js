// pages/natural/index.js — 自然口语课程首页
//
// 阶段四 A: 9 类自然口语规则 + 180 条重点句索引
//   - 只读, 不进入训练
//   - 音频未就绪, 顶部明确标记 "⏳ 待音频 (0/180)"
//   - 点击课程 → 进入通用 lesson 详情页 (id 参数)

let _naturalData = null;
try {
  _naturalData = require('../../utils/natural-data.js');
} catch (e) {
  console.error('[natural/index] require natural-data FAILED:', e?.message || e, e?.stack);
}

Page({
  data: {
    summary: null,
    lessons: [],
    loadError: null,
  },

  onShow() {
    if (!_naturalData) {
      this.setData({ loadError: 'utils/natural-data.js 加载失败' });
      return;
    }
    try {
      const summary = _naturalData.getAudioStatusSummary();
      const lessons = _naturalData.getLessonList();
      this.setData({ summary, lessons, loadError: null });
      console.log('[natural/index] loaded', lessons.length, 'lessons, audio', summary.audioReady + '/' + summary.total);
    } catch (e) {
      console.error('[natural/index] onShow FAILED:', e?.message || e, e?.stack);
      this.setData({ loadError: 'onShow 失败: ' + (e?.message || e) });
    }
  },

  onOpenLesson(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/natural/lesson?id=${encodeURIComponent(id)}`,
    });
  },

  onOpenSampleReview() {
    wx.navigateTo({
      url: '/pages/natural/sample-review',
    });
  },

  onShareAppMessage() {
    return {
      title: '英语快充 · 自然口语解码',
      path: '/pages/natural/index',
    };
  },
});
