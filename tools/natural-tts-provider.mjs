#!/usr/bin/env node
/**
 * tools/natural-tts-provider.mjs
 *
 * 阶段四 B — 可替换的 TTS 音频适配层。
 *
 * 设计目标 (按 user 2026-07-17 决策):
 *   1. 适配层不写死服务, 业务代码只调用统一接口
 *   2. 每个生成的音频文件必带完整元数据
 *   3. 换 provider/voice/model 不需要重写课程数据或页面
 *
 * 标准 metadata schema:
 *   {
 *     provider, voice, model, speed, instructions, outputFormat,
 *     sourceText, generatedAt,
 *     contentHash, fileHash, duration,
 *     generationStatus, errorMessage
 *   }
 *
 * 当前实现:
 *   - MiniMaxTTSProvider (主用, 工具层调用 MiniMax MCP TTS)
 *   - FutureTTSProvider  (占位, 未来接 OpenAI tts-1 / ElevenLabs / Edge / Azure)
 *
 * 业务用法 (示范):
 *   import { getProvider, buildMeta } from './natural-tts-provider.mjs';
 *   const provider = getProvider('MiniMax-tts');
 *   const result = await provider.synthesize('I can help you', {
 *     voice: 'English_Trustworthy_Man',
 *     speed: 0.95,
 *     emotion: 'neutral',
 *   });
 *   const meta = buildMeta(sentence, 'clear', result, { speed: 0.95, voice: 'English_Trustworthy_Man' });
 *   fs.writeFileSync(outPath, result.buffer);
 *   fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
 *
 * 注: 本文件是**逻辑层 + 抽象 + 元数据构造器**。
 *    实际 TTS 调用通过 MiniMax MCP 工具 (batch_synthesize_speech) 在生成脚本中触发,
 *    生成脚本负责把工具返回值接到本适配层的统一格式。
 */

import crypto from 'node:crypto';

// === 标准 metadata 字段顺序 (写盘时按此顺序) ===
export const META_FIELDS = [
  'provider', 'voice', 'model', 'speed', 'instructions', 'outputFormat',
  'sourceText', 'generatedAt',
  'contentHash', 'fileHash', 'duration',
  'generationStatus', 'errorMessage',
];

/**
 * 构造一份标准 metadata
 * @param {object} ctx - { sentence, version, provider, voice, model, speed, instructions, outputFormat, sourceText, result, errorMessage }
 * @returns {object} 标准 metadata
 */
export function buildMeta(ctx) {
  const {
    provider,
    voice = null,
    model = null,
    speed = null,
    instructions = null,
    outputFormat = 'mp3',
    sourceText,
    result = null,           // { buffer, duration, fileHash }
    errorMessage = null,
    generatedAt = new Date().toISOString(),
  } = ctx;

  const contentHash = crypto.createHash('sha256').update(sourceText).digest('hex');

  const out = {
    provider,
    voice,
    model,
    speed,
    instructions,
    outputFormat,
    sourceText,
    generatedAt,
    contentHash,
    fileHash: result?.fileHash || null,
    duration: result?.duration ?? null,
    generationStatus: errorMessage ? 'failed' : 'success',
    errorMessage,
  };

  // 强制字段顺序
  const ordered = {};
  for (const f of META_FIELDS) ordered[f] = out[f];
  return ordered;
}

/**
 * 计算 mp3 buffer 的 sha256
 */
export function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Provider 抽象基类
 * 任何 TTS 服务必须实现 synthesize(text, opts) -> { buffer, duration, error, raw? }
 */
export class TTSProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * @param {string} text
   * @param {object} opts - { voice, speed, emotion, ... }
   * @returns {Promise<{ buffer: Buffer, duration: number|null, error: string|null, raw?: any }>}
   */
  async synthesize(text, opts) {
    throw new Error(`TTSProvider ${this.name}: synthesize() not implemented`);
  }

  /**
   * 列出该 provider 支持的 voices
   * @returns {Promise<Array<{voice_id, voice_name}>>}
   */
  async listVoices() {
    throw new Error(`TTSProvider ${this.name}: listVoices() not implemented`);
  }
}

/**
 * MiniMax TTS provider
 *
 * 通过 MiniMax MCP 的 batch_synthesize_speech 工具调用。
 * 由于 MCP 工具只在 agent 会话中可用, 本类不直接调用 API,
 * 而是在 generate-12-samples.mjs 脚本中通过工具调用, 然后把 buffer
 * 喂回 buildMeta()。
 *
 * 支持的 voice (英文美式相关, 2026-07-17 取自 get_voice_list):
 *   - English_Trustworthy_Man    (推荐主用, 偏播报/清晰)
 *   - English_Graceful_Lady      (女声备用)
 *   - English_Diligent_Man       (偏自然对话)
 *   - English_Gentle-voiced_man  (轻柔)
 *   - English_Whispering_girl    (气声, 不推荐做训练)
 *   - English_Aussie_Bloke       (澳洲口音, 不推荐美式训练)
 *
 * 已知限制:
 *   - MiniMax TTS 不支持 IPA 输入, "自然语速" 的弱读/连读/闪音/同化
 *     必须靠 naturalText 的拼写压缩 (didja / wanna / lemme / gonna) +
 *     speed 设置来接近, 做不到 ElevenLabs / OpenAI tts-1 那种
 *     "instructions 驱动 IPA 微调" 的精度。
 *   - speed > 1.1 可能引发合成不稳定, 实测建议 clear=0.9, natural=1.05。
 */
export class MiniMaxTTSProvider extends TTSProvider {
  constructor() {
    super('MiniMax-tts');
    this.model = 'speech-01';
    this.outputFormat = 'mp3';
    this.recommendedVoices = {
      male_clear:  'English_Trustworthy_Man',
      male_natural: 'English_Diligent_Man',
      female_clear: 'English_Graceful_Lady',
      female_natural: 'English_Graceful_Lady',
    };
  }

  async listVoices() {
    // 实际返回通过 get_voice_list 工具获取
    return [
      { voice_id: 'English_Trustworthy_Man',  voice_name: 'Trustworthy Man' },
      { voice_id: 'English_Graceful_Lady',     voice_name: 'Graceful Lady' },
      { voice_id: 'English_Diligent_Man',      voice_name: 'Diligent Man' },
      { voice_id: 'English_Gentle-voiced_man', voice_name: 'Gentle-voiced man' },
      { voice_id: 'English_Whispering_girl',   voice_name: 'Whispering girl' },
      { voice_id: 'English_Aussie_Bloke',      voice_name: 'Aussie Bloke (NOT American — not for training)' },
    ];
  }

  /**
   * 本方法在 Node.js 脚本中**不会真正调用**, 实际生成走 MCP 工具。
   * 这里提供一份 "伪实现" 用于测试元数据构造 / 错误分支。
   */
  async synthesize(text, opts = {}) {
    // 校验参数
    if (!text || !text.trim()) {
      return { buffer: null, duration: null, error: 'empty text' };
    }
    if (opts.speed !== undefined && (opts.speed < 0.5 || opts.speed > 2.0)) {
      return { buffer: null, duration: null, error: `speed ${opts.speed} out of [0.5, 2.0]` };
    }
    if (opts.emotion && !['happy','sad','angry','fearful','disgusted','surprised','neutral'].includes(opts.emotion)) {
      return { buffer: null, duration: null, error: `unknown emotion ${opts.emotion}` };
    }
    return { buffer: null, duration: null, error: 'MiniMaxTTSProvider: synthesize() requires MCP tool call (see tools/generate-12-samples.mjs)' };
  }
}

/**
 * Future OpenAI tts-1 provider (占位)
 * user 决策: 先用 MiniMax 做 12 条样板, 验收通过后再讨论是否切到 OpenAI/ElevenLabs。
 */
export class OpenAITTSProvider extends TTSProvider {
  constructor() {
    super('openai-tts-1');
    this.model = 'tts-1';
    this.outputFormat = 'mp3';
  }

  async synthesize(text, opts = {}) {
    throw new Error('OpenAITTSProvider: not yet wired up. Requires OPENAI_API_KEY in vault and network access to api.openai.com.');
  }
}

/**
 * Provider 工厂
 * @param {string} name
 * @returns {TTSProvider}
 */
export function getProvider(name) {
  switch (name) {
    case 'MiniMax-tts': return new MiniMaxTTSProvider();
    case 'openai-tts-1': return new OpenAITTSProvider();
    default: throw new Error(`unknown TTS provider: ${name}`);
  }
}

/**
 * 列出当前可用的 providers
 */
export function listProviders() {
  return [
    { name: 'MiniMax-tts', status: 'ready', notes: '通过 MiniMax MCP batch_synthesize_speech 调用, 无网络出口, 无需 API key' },
    { name: 'openai-tts-1', status: 'stub', notes: '占位, 需 vault 配 OPENAI_API_KEY, 决定是否切' },
  ];
}
