// app.js  — Vocora 入口
// 职责：
//   - onLaunch: tts.prewarm()（app 一启动就把 audio context 预热掉）
//   - 全局错误兜底（不让任何 JS 报错白屏）
//   - 输出 build 标记（联调时一眼看出哪个版本）
//
// 设计说明：
//   - buildTag 保持为通用公开版本号（不包含内部阶段名 / 日期 / 调试名），
//     避免泄露开发节奏。CI/release 流程如需更细粒度，请改用环境变量注入。
//   - audioBase 指向公开 CDN（wujiong.cn 是面向用户的资源域名），保留。

const tts = require('./utils/tts.js');

App({
  globalData: {
    buildTag: 'vocora-public-v1',
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
    // 切前台：不再 reset tts（reset 会 destroy _ctx，导致训练页 speak 报
    // "operateAudio:fail audiolnstance is not set"）。 _ctx 单例在 onLaunch
    // 已 prewarm，全局复用。 仅在用户显式重置时重建（mine 页"重置"按钮）。
  },

  onError(err) {
    // 任何 page 抛的未捕获错误打到日志（v2 不做远程上报）
    console.error('[app] onError:', err);
  },
});
