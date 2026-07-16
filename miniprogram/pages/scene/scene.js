// pages/scene/scene.js — 场景页（阶段一占位）
Page({
  data: {
    groups: [
      { id: 'life',   name: '生活', count: 4 },
      { id: 'travel', name: '旅行', count: 4 },
      { id: 'work',   name: '工作', count: 3 },
      { id: 'biz',    name: '外贸', count: 2 },
      { id: 'social', name: '社交', count: 2 },
      { id: 'urgent', name: '紧急', count: 1 },
    ],
  },
  onSceneTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({ title: `场景 ${id} 在阶段六实现`, icon: 'none' });
  },
});
