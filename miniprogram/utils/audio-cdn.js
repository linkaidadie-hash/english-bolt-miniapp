// utils/audio-cdn.js — CDN URL 构造 + 资产查询
//
// 阶段一固定指向 https://english.wujiong.cn/audio/
// 阶段二会引入 "本地资产优先 / CDN 兜底" 策略。
//
// 重要约定：找不到的音频**绝不**返回假 URL（user 红线）。
//   → getWordAudio() 返回 { url, exists }
//   → page 拿到 exists=false 时显示 "missing" 占位 + 跳过播放

const BASE = 'https://english.wujiong.cn/audio/';

function wordAudioUrl(word) {
  if (!word) return { url: null, exists: false };
  return {
    url: BASE + encodeURIComponent(word) + '.mp3',
    exists: true, // 阶段一不验证；阶段二用 data/audio-audit.jsonl 校验
  };
}

// 阶段二会扩展为：sentence 三档音频 (audioSegmented / audioClear / audioNatural)
function sentenceAudioUrl(sentenceId, variant /* 'segmented'|'clear'|'natural' */) {
  // 阶段一 stub：还没生成。返回 null，让 page 标 missing。
  return { url: null, exists: false, variant };
}

module.exports = { BASE, wordAudioUrl, sentenceAudioUrl };
