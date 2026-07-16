// utils/audio-cdn.js — v2 音频 URL 构造 + 资产查询
//
// 阶段二：通过 data-repository 查 audio 元数据
// 阶段四扩展：sentence 三档音频 (audioSegmented / audioClear / audioNatural)
//
// 重要约定（user 红线）：
//   - 找不到的音频**绝不**返回假 URL
//   - 返回 { url, exists, status, kind }，exists=false 时 page 标 missing
//   - 用户在 page 自己处理 missing 提示

const repo = require('./data-repository.js');

const BASE = 'https://english.wujiong.cn/audio/';

function wordAudio(wordOrId) {
  if (!wordOrId) return { url: null, exists: false, status: 'missing', kind: null };

  // 支持 id 查
  let word = (typeof wordOrId === 'object' && wordOrId.word) ? wordOrId.word : wordOrId;
  let entry = (typeof wordOrId === 'object') ? wordOrId : repo.getWordByText(word);

  if (!entry) {
    return { url: null, exists: false, status: 'missing', kind: null };
  }
  if (!entry.audio || !entry.audio.url) {
    return { url: null, exists: false, status: 'missing', kind: entry.audio?.kind || null };
  }
  return {
    url: entry.audio.url,
    exists: true,
    status: entry.audio.status,  // 'ready' | 'ready_spell' | 'ready_chinese' | 'missing'
    kind: entry.audio.kind,      // 'standard' | 'spell' | 'chinese'
  };
}

// 阶段二 stub：sentence 三档音频尚未生成
function sentenceAudio(sentenceId, variant) {
  return { url: null, exists: false, status: 'missing', kind: null, variant };
}

module.exports = { BASE, wordAudio, sentenceAudio };
