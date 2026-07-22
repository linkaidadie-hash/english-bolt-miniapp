// pages/scene/scene.js — 场景首页 (16 个首发场景)
const scenes = require('../../data/scenes.js');
const tts = require('../../utils/tts.js');

Page({
  data: {
    groups: [],
    allScenes: [],
    currentGroup: null,
  },

  onLoad() {
    const groups = scenes.getCategories();
    this.setData({ groups, allScenes: scenes.getAll() });
  },

  onUnload() { try { tts.stop(); } catch (e) {} },

  // 选分类 → 显示场景列表
  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    const list = scenes.getByCategory(id);
    this.setData({ currentGroup: { id, list } });
  },

  onBackToGroups() {
    this.setData({ currentGroup: null });
  },

  onSceneTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/scene/learn?id=${id}` });
  },
});
