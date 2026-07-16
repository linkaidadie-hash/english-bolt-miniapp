// app.js  — 英语快充 v2 入口
// 阶段一职责：
//   - onLaunch: tts.prewarm()（app 一启动就把 audio context 预热掉）
//   - 全局错误兜底（v2 不让任何 JS 报错白屏）
//   - 输出 build 标记（联调时一眼看出哪个版本）

const tts = require('./utils/tts.js');

App({
  globalData: {
    buildTag: 'phase2-data-layer-2026-07-16',
    // v2 阶段二会替换为正式 audio base + 完整 word/sentence 库
    audioBase: 'https://english.wujiong.cn/audio/',
  },

  onLaunch() {
    console.log('[app] onLaunch', this.globalData.buildTag);

    // prewarm：让 InnerAudioContext 第一次 play() 不再被 "interrupted" 拒掉
    // 原项目踩过这个坑：tts.js 没 prewarm，每个英文单词都"加载中一闪而逝"
    tts.prewarm().catch(e => {
      console.warn('[app] tts prewarm 失败 (非阻塞):', e?.message || e);
    });
  },

  onShow() {
    // 切前台：兜底重置 audio state（防止后台被微信音频焦点打断后状态错乱）
    if (typeof tts.reset === 'function') {
      tts.reset();
    }
  },

  onError(err) {
    // 任何 page 抛的未捕获错误打到日志（v2 不做远程上报）
    console.error('[app] onError:', err);
  },
});
