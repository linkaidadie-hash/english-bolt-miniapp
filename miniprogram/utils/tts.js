// utils/tts.js — 英语快充 v2 全局音频管理器（阶段三加固版 v3）
//
// 修原项目三大坑 + 阶段三加固：
//   1) InnerAudioContext.onCanplay 不可靠 → 不 await onCanplay
//   2) 第一次 ctx.play() reject "interrupted" → prewarm
//   3) 全局 onStop/onEnded 无 staleness 检查 → token 守门
//   4) ctx.play() 在某些基础库返回 undefined → 链式判断
//   5) 切前后台 app.onShow 调 tts.reset() 破坏 _ctx → 已移除
//   6) ctx.play() 静默失败（不抛错不 fire onPlay）→ 兜底 timeout
//   7) speak() 时 _ctx 还没就绪 → lazy prewarm + rebuild + retry once
//   8) listen all missing audio → 立即 emit error 不卡 loading
//
// 阶段四 B (2026-07-17) 调整：
//   - onPlay 兜底 timeout 从 800ms 提到 2000ms
//   - 原因：12 条样板验收时偶发"播放失败 + 实际又播了"，是首次 HTTPS 下载
//     + 微信 audio context 冷启动需要 1-2s，800ms 太紧
//   - 2000ms 仍能覆盖静默失败 (真失败 onPlay 永不 fire)，
//     同时兼顾冷缓存的正常延迟
//
// 设计原则：
//   - 单例 _ctx（lazy init + prewarm）
//   - 每个 speak 自带 token；事件回调先验 token
//   - speak() 失败时自动 rebuild + retry + 兜底 timeout
//   - 2000ms 内 onPlay 不 fire → 强制 error（救回"静默失败"）

let _ctx = null;
let _token = 0;
let _state = { token: 0, phase: 'idle', error: null };
let _listeners = new Set();
let _warmed = false;
let _prewarmPromise = null;
let _playTimeouts = new Map();   // token -> timeoutId (800ms onPlay 兜底)

function _emit(evt) {
  // onPlay / onEnded / onError / onStop 都清掉该 token 的 800ms 兜底 timeout
  if (evt.type === 'play' || evt.type === 'ended' || evt.type === 'error' || evt.type === 'stop') {
    const t = _playTimeouts.get(evt.token);
    if (t) { clearTimeout(t); _playTimeouts.delete(evt.token); }
  }
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

function _rebuild() {
  if (_ctx) {
    try { _ctx.destroy(); } catch (e) {}
    _ctx = null;
  }
  _warmed = false;
  return _getCtx();
}

function _armPlayTimeout(myToken) {
  // 2000ms 内 onPlay 不 fire → 强制 emit error（救回静默失败）
  // 注: 800ms 太紧, 首次 HTTPS 下载 + 微信 audio context 冷启动常 1-2s
  if (_playTimeouts.has(myToken)) clearTimeout(_playTimeouts.get(myToken));
  const t = setTimeout(() => {
    _playTimeouts.delete(myToken);
    if (_state.token !== myToken) return;
    if (_state.phase !== 'loading') return;
    console.warn('[tts] onPlay 2000ms 未 fire — 兜底 emit error, myToken=', myToken);
    _state.phase = 'error';
    _state.error = 'audio play 静默失败 (onPlay timeout 2000ms)';
    _emit({ type: 'error', token: myToken, error: _state.error });
  }, 2000);
  _playTimeouts.set(myToken, t);
}

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
        try { p = ctx.play(); } catch (e) {}
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

function speak(url, opts = {}) {
  if (!url) {
    return Promise.reject(new Error('tts.speak: url 必填'));
  }

  const myToken = ++_token;
  _state = { token: myToken, phase: 'loading', error: null };
  _armPlayTimeout(myToken);  // 800ms onPlay 兜底

  // 一次性 listener
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

  const doSpeak = (attempt) => {
    if (_state.token !== myToken) return;  // stale
    const ctx = _getCtx();
    if (!ctx) {
      if (attempt === 1) {
        console.warn('[tts] _getCtx 返回 null，rebuild + retry');
        _rebuild();
        return setTimeout(() => doSpeak(2), 80);
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
        return setTimeout(() => doSpeak(2), 100);
      }
      if (opts.onError) opts.onError({ type: 'error', token: myToken, error: e?.errMsg || String(e) });
      return;
    }
    setTimeout(() => {
      if (_state.token !== myToken) return;
      let p;
      try {
        p = ctx.play();
      } catch (e) {
        if (attempt === 1) {
          console.warn('[tts] play 抛错，rebuild + retry:', e?.errMsg || e);
          _rebuild();
          return setTimeout(() => doSpeak(2), 100);
        }
        if (opts.onError) opts.onError({ type: 'error', token: myToken, error: e?.errMsg || String(e) });
        return;
      }
      if (p && typeof p.catch === 'function') {
        p.catch(e => {
          if (_state.token !== myToken) return;
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
      // play() 不返回 Promise — 靠 800ms 兜底 timeout 救回
    }, 0);
  };

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
  // 清掉所有兜底 timeout
  for (const t of _playTimeouts.values()) clearTimeout(t);
  _playTimeouts.clear();
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
  for (const t of _playTimeouts.values()) clearTimeout(t);
  _playTimeouts.clear();
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
