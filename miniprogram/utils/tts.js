// utils/tts.js — 英语快充 v2 全局音频管理器（阶段三加固版）
//
// 修原项目三大坑 + 阶段三加固：
//   1) InnerAudioContext.onCanplay 不可靠 → 不 await onCanplay
//   2) 第一次 ctx.play() reject "interrupted" → prewarm
//   3) 全局 onStop/onEnded 无 staleness 检查 → token 守门
//   4) ctx.play() 在某些基础库返回 undefined → 链式判断
//   5) 切前后台 app.onShow 调 tts.reset() 破坏 _ctx → 已移除
//   6) speak() 时 _ctx 还没就绪 → lazy prewarm + rebuild + retry once
//
// 设计原则：
//   - 单例 _ctx（lazy init + prewarm）
//   - 每个 speak 自带 token；事件回调先验 token
//   - speak() 失败时自动 rebuild ctx + retry 一次（救回"audiolnstance is not set"）

let _ctx = null;
let _token = 0;
let _state = { token: 0, phase: 'idle', error: null };
let _listeners = new Set();
let _warmed = false;
let _prewarmPromise = null;   // 单次 prewarm 共享 promise（避免并发重建）

function _emit(evt) {
  for (const fn of _listeners) {
    try { fn(evt); } catch (e) { console.warn('[tts] listener err:', e); }
  }
}

function _getCtx() {
  if (_ctx) return _ctx;
  try {
    _ctx = wx.createInnerAudioContext();
  } catch (e) {
    console.warn('[tts] createInnerAudioContext 失败:', e?.message || e);
    _ctx = null;
    return null;
  }
  if (!_ctx) {
    console.warn('[tts] createInnerAudioContext 返回 null');
    return null;
  }
  _ctx.useWebAudioImplement = false;
  _ctx.obeyMuteSwitch = false;
  _ctx.autoplay = false;

  _ctx.onPlay(() => {
    if (_state.token !== _token) return;
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
 * 销毁并重建 ctx（speak 失败后兜底用）
 */
function _rebuild() {
  if (_ctx) {
    try { _ctx.destroy(); } catch (e) {}
    _ctx = null;
  }
  _warmed = false;
  // _listeners 保留（page 端订阅不变）
  return _getCtx();
}

/**
 * 预热：app.onLaunch 调用一次。 idempotent + 共享 promise。
 * 不在 onShow 调用（避免破坏 ctx）。
 */
function prewarm() {
  if (_warmed && _ctx) return Promise.resolve();
  if (_prewarmPromise) return _prewarmPromise;
  _prewarmPromise = new Promise((resolve) => {
    try {
      const ctx = _getCtx();
      if (!ctx) { _prewarmPromise = null; resolve(); return; }
      ctx.src = 'https://english.wujiong.cn/audio/the.mp3';
      setTimeout(() => {
        let p;
        try { p = ctx.play(); } catch (e) { /* 预热失败非阻塞 */ }
        if (p && typeof p.catch === 'function') p.catch(() => {});
        setTimeout(() => {
          try { ctx.stop(); } catch (e) {}
          _warmed = true;
          _prewarmPromise = null;
          resolve();
        }, 600);
      }, 60);
    } catch (e) {
      console.warn('[tts] prewarm 异常:', e?.message || e);
      _prewarmPromise = null;
      resolve();
    }
  });
  return _prewarmPromise;
}

/**
 * 播一个远程 mp3 url。
 * 失败自动 rebuild + retry 一次（救回 audiolnstance is not set 场景）。
 *
 * @param {string} url
 * @param {object} opts { onPlay, onEnded, onError }
 * @returns {Promise<{token:number}>}
 */
function speak(url, opts = {}) {
  if (!url) {
    return Promise.reject(new Error('tts.speak: url 必填'));
  }

  const myToken = ++_token;
  _state = { token: myToken, phase: 'loading', error: null };

  // 注册一次性 listener
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

  // 内部 retry once：ctx 不存在 / play 抛 audiolnstance 错时重建再播
  const doSpeak = (attempt = 1) => {
    const ctx = _getCtx();
    if (!ctx) {
      if (attempt === 1) {
        // 第一次：ctx 不存在 → rebuild + retry
        _rebuild();
        return setTimeout(() => doSpeak(2), 50);
      }
      if (opts.onError) opts.onError({ type: 'error', token: myToken, error: 'audioContext 不可用' });
      return;
    }
    try { ctx.stop(); } catch (e) {}
    try {
      ctx.src = url;
    } catch (e) {
      if (attempt === 1) {
        _rebuild();
        return setTimeout(() => doSpeak(2), 50);
      }
      if (opts.onError) opts.onError({ type: 'error', token: myToken, error: e?.errMsg || String(e) });
      return;
    }
    setTimeout(() => {
      let p;
      try {
        p = ctx.play();
      } catch (e) {
        if (attempt === 1) {
          // audiolnstance is not set 等：rebuild + retry
          console.warn('[tts] play 抛错，rebuild + retry:', e?.errMsg || e);
          _rebuild();
          return setTimeout(() => doSpeak(2), 100);
        }
        if (opts.onError) opts.onError({ type: 'error', token: myToken, error: e?.errMsg || String(e) });
        return;
      }
      if (p && typeof p.catch === 'function') {
        p.catch(e => {
          if (myToken !== _state.token) return;
          // "interrupted" 是 stop/play 竞态，忽略；其他 error 透传
          if (e?.errMsg && !String(e.errMsg).includes('interrupted')) {
            if (attempt === 1) {
              console.warn('[tts] play() rejected, rebuild + retry:', e.errMsg);
              _rebuild();
              return setTimeout(() => doSpeak(2), 100);
            }
            console.warn('[tts] play() rejected (final):', e.errMsg);
          }
        });
      }
      // play() 不返回 Promise — 靠 onPlay/onError 事件驱动
    }, 0);
  };

  // 先确保 prewarm 完成（lazy await）
  if (!_warmed) {
    prewarm().finally(() => doSpeak(1));
  } else {
    doSpeak(1);
  }

  return Promise.resolve({ token: myToken });
}

function stop() {
  const ctx = _getCtx();
  if (ctx) {
    try { ctx.stop(); } catch (e) {}
  }
  _token++;
  _state = { token: _token, phase: 'idle', error: null };
}

function reset() {
  if (_ctx) {
    try { _ctx.destroy(); } catch (e) {}
    _ctx = null;
  }
  _warmed = false;
  _prewarmPromise = null;
  _token++;
  _state = { token: _token, phase: 'idle', error: null };
  _listeners.clear();
}

function onEvent(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

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
