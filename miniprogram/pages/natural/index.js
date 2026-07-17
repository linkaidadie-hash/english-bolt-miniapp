// pages/natural/index.js — 自然口语课程首页
//
// 阶段四 A: 9 类自然口语规则 + 180 条重点句索引
//   - 只读, 不进入训练
//   - 音频未就绪, 顶部明确标记 "⏳ 待音频 (0/180)"
//   - 点击课程 → 进入通用 lesson 详情页 (id 参数)

const naturalData = require('../../utils/natural-data.js');

Page({
  data: {
    summary: null,
    lessons: [],
  },

  onShow() {
    const summary = naturalData.getAudioStatusSummary();
    const lessons = naturalData.getLessonList();
    this.setData({ summary, lessons });
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
