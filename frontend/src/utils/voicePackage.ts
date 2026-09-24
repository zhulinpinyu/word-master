/**
 * 语音包查询
 * ------------------------------------------------------------------
 * 把注册表中的所有单词构建成一张「规范化单词 → 音频 URL」的索引，
 * 供发音播放时快速命中真人录音。
 */

import { VOICE_PACKAGES } from '@/data/voice-packages'

/**
 * 归一化用于匹配的单词键：
 * 转小写、压缩空白、去掉结尾的句末标点（. ! ?）。
 * 例如 "Good morning." 与 "good morning" 视为同一个词。
 */
export function normalizeWordKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
}

const audioIndex = new Map<string, string>()

for (const pack of VOICE_PACKAGES) {
  for (const unit of pack.units) {
    for (const entry of unit.words) {
      const key = normalizeWordKey(entry.word)
      if (key && !audioIndex.has(key)) audioIndex.set(key, entry.audio)
    }
  }
}

/** 返回该文本命中的真人录音地址；未命中返回 null。 */
export function resolveVoiceAudio(text: string): string | null {
  const key = normalizeWordKey(text)
  if (!key) return null
  return audioIndex.get(key) ?? null
}
