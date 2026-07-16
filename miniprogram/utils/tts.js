// utils/tts.js — 英语快充 v2 全局音频管理器
//
// 修原项目踩过的三个致命坑（见 memory/agent tail）：
//   1) InnerAudioContext.onCanplay 不可靠（mp3 已缓存 / 短音频 / wx bug）→ 不要 await onCanplay
//   2) 第一次 ctx.play() 在新 context 上会 reject "interrupted" → 需要 prewarm
//   3) 全局 onStop/onEnded 没做 staleness 检查，旧 stop 事件会迟到 clobber 新 state
//      → 每个事件回调先验 token
//
// 设计原则：
//   - 单例 _ctx，所有 speak 走同一 context（避免多 context 抢音频焦点）
//   - 每个 speak 自带 token；事件回调先比对 token 再更新 state
//   - 不做"完美无瑕"——只确保"能稳定出声 + UI 状态不闪烁"这两件事
//   - 阶段一只支持 mp3 远程 URL；TTS 生成留给阶段二

let _ctx = null;
let _token = 0;            // 下一个可分配的 token
let _state = { token: 0, phase: 'idle', error: null };
let _listeners = new Set();
let _warmed = false;

function _emit(evt) {
  for (const fn of _listeners) {
    try { fn(evt); } catch (e) { console.warn('[tts] listener err:', e); }
  }
}

function _getCtx() {
  if (_ctx) return _ctx;
  // 注意：require 在小程序里要顶层。这里 app.js 顶层 require('./utils/tts.js')，
  // 调用 _getCtx() 一定在 Page onLoad 之后，所以 wx 是可用的。
  _ctx = wx.createInnerAudioContext();
  _ctx.useWebAudioImplement = false; // 兼容性优先
  _ctx.obeyMuteSwitch = false;      // 静音模式下也出声（学习场景需要）
  _ctx.autoplay = false;

  _ctx.onPlay(() => {
    if (_state.token !== _token) return; // stale, 丢弃
    _state.phase = 'playing';
    _emit({ type: 'play', token: _state.token });
  });
  _ctx.onPause(() => {
    if (_state.token !== _token) return;
    _state.phase = 'paused';
    _emit({ type: 'pause', token: _state.token });
  });
  _ctx.onStop(() => {
    if (_state.token !== _token) return;
    _state.phase = 'idle';
    _emit({ type: 'stop', token: _state.token });
  });
  _ctx.onEnded(() => {
    if (_state.token !== _token) return;
    _state.phase = 'ended';
    _emit({ type: 'ended', token: _state.token });
  });
  _ctx.onError((err) => {
    if (_state.token !== _token) return;
    _state.phase = 'error';
    _state.error = err?.errMsg || String(err);
    _emit({ type: 'error', token: _state.token, error: _state.error });
  });

  return _ctx;
}

/**
 * 预热 InnerAudioContext：app.onLaunch 调用一次，让首个 play() 不被 "interrupted" 拒掉。
 * 不 await，让它在后台跑。
 */
function prewarm() {
  if (_warmed) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const ctx = _getCtx();
      // 用一个已知的 1-2s 短音频热身。CDN 已有 200 命中的 the.mp3。
      ctx.src = 'https://english.wujiong.cn/audio/the.mp3';
      // 给 WeChat 内部 pipeline 一点时间（避免首 play 立刻 interrupted）
      setTimeout(() => {
        let p;
        try { p = ctx.play(); } catch (e) { /* 预热失败非阻塞 */ }
        if (p && typeof p.catch === 'function') p.catch(() => {});
        setTimeout(() => {
          try { ctx.stop(); } catch (e) {}
          _warmed = true;
          resolve();
        }, 600);
      }, 60);
    } catch (e) {
      // 整个 prewarm 失败也不能阻塞 app 启动
      console.warn('[tts] prewarm 异常:', e?.message || e);
      resolve();
    }
  });
}

/**
 * 播一个远程 mp3 url。
 * @param {string} url 必填
 * @param {object} opts { onPlay, onEnded, onError }
 * @returns {Promise<{token:number}>} 立即 resolve；播放结果通过 opts 回调
 */
function speak(url, opts = {}) {
  if (!url) {
    return Promise.reject(new Error('tts.speak: url 必填'));
  }
  const ctx = _getCtx();
  const myToken = ++_token;
  _state = { token: myToken, phase: 'loading', error: null };

  // 注册一次性 listener（不破坏 _listeners 集合）
  const handler = (evt) => {
    if (evt.token !== myToken) return;
    if (evt.type === 'play' && opts.onPlay) opts.onPlay(evt);
    else if (evt.type === 'ended' && opts.onEnded) opts.onEnded(evt);
    else if (evt.type === 'error' && opts.onError) opts.onError(evt);
    if (['ended', 'error', 'stop'].includes(evt.type)) {
      _listeners.delete(handler);
    }
  };
  _listeners.add(handler);

  // 关键：先 stop 上一个（如果有），再设 src，再 play。
  // 中间留 0ms 让 WeChat 内部 pipeline 走完（参考原项目调试结论）
  try { ctx.stop(); } catch (e) {}
  ctx.src = url;
  setTimeout(() => {
    // 微信 InnerAudioContext.play() 在不同基础库下可能返回 Promise 或 undefined
    // 不能直接 .catch() — 先做链式判断
    let p;
    try {
      p = ctx.play();
    } catch (e) {
      // 同步抛错（如 src 未设置）— 走 onError 流程
      if (myToken === _state.token) {
        _state.phase = 'error';
        _state.error = e?.errMsg || String(e);
        _emit({ type: 'error', token: myToken, error: _state.error });
      }
      return;
    }
    if (p && typeof p.catch === 'function') {
      p.catch(e => {
        // "interrupted" 是 stop/play 竞态，不是真错；交给 onPlay/onError 流程
        if (myToken === _state.token) {
          // 仍保持 loading 态，让 onError 兜底
          console.warn('[tts] play() rejected:', e?.errMsg || e);
        }
      });
    }
    // play() 不返回 Promise (某些基础库) — 不挂回调，靠 onPlay/onError 事件驱动
  }, 0);

  return Promise.resolve({ token: myToken });
}

/**
 * 主动停止当前播放。
 */
function stop() {
  const ctx = _getCtx();
  try { ctx.stop(); } catch (e) {}
  _token++; // 让任何 in-flight 事件全部 stale
  _state = { token: _token, phase: 'idle', error: null };
}

/**
 * 重置 audio context（app.onShow / 异常恢复用）。
 */
function reset() {
  if (_ctx) {
    try { _ctx.destroy(); } catch (e) {}
    _ctx = null;
  }
  _warmed = false;
  _token++;
  _state = { token: _token, phase: 'idle', error: null };
  _listeners.clear();
}

/**
 * 监听全局音频事件（play/pause/stop/ended/error）。
 * 返回取消订阅函数。
 */
function onEvent(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * 当前 state 快照。
 */
function getState() {
  return { ..._state };
}

module.exports = {
  prewarm,
  speak,
  stop,
  reset,
  onEvent,
  getState,
};
