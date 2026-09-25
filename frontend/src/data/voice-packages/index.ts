/**
 * 语音包注册表
 * ------------------------------------------------------------------
 * 每个语音包对应一份教材的真人录音清单（JSON），由
 * `scripts/fetch-voice-package.mjs` 生成，只记录远程音频与插图 URL。
 *
 * 新增语音包：运行生成器脚本，然后把 JSON import 进来追加到下方数组即可。
 */

import hjbszSanshang from './hjbsz-sanshang.json'

export interface VoicePackageWord {
  word: string
  phonetic?: string
  chinese?: string
  /** 远程 MP3 地址（真人录音） */
  audio: string
  /** 远程教材插图地址；部分词条可能缺失 */
  image?: string
}

export interface VoicePackageUnit {
  lessonId: number
  title: string
  words: VoicePackageWord[]
}

export interface VoicePackage {
  id: string
  name: string
  book?: string
  source?: string
  generatedAt?: string
  units: VoicePackageUnit[]
}

export const VOICE_PACKAGES: VoicePackage[] = [
  hjbszSanshang as VoicePackage,
]
