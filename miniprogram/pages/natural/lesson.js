// pages/natural/lesson.js — 通用自然口语课程详情页
//
// 通过 ?id=weak-form 等参数区分 9 类课程
// 阶段四 A: 只展示 20 条重点句的内容(原文/翻译/慢速/自然/IPA/重音/意群/变化点/音频状态)
// 阶段四 A 不播放音频,等 B 阶段音频部署后再加播放按钮
// 阶段四 A 不进入训练,等 B 阶段开启训练模式

const naturalData = require('../../utils/natural-data.js');

Page({
  data: {
    lesson: null,
    sentences: [],
    audioReadyCount: 0,
  },

  onLoad(options) {
    const id = options.id;
    if (!id) {
      wx.showToast({ title: '课程不存在', icon: 'error' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    const lesson = naturalData.getLesson(id);
    if (!lesson) {
      wx.showToast({ title: '课程不存在', icon: 'error' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    wx.setNavigationBarTitle({ title: lesson.name });

    const sentences = lesson.sentences;
    const audioReadyCount = sentences.filter(
      s => s.audioClear.status === 'ready' && s.audioNatural.status === 'ready'
    ).length;

    this.setData({ lesson, sentences, audioReadyCount });
  },

  onShareAppMessage() {
    const l = this.data.lesson;
    if (!l) return {};
    return {
      title: `英语快充 · ${l.name}`,
      path: `/pages/natural/lesson?id=${encodeURIComponent(l.id)}`,
    };
  },
});
