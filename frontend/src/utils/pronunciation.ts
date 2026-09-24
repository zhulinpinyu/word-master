/**
 * 发音播放
 * ------------------------------------------------------------------
 * 播放优先级：
 *   1. 语音包里的真人录音（远程 MP3，命中即秒播，不依赖 TTS 配置）
 *   2. 命中不到时回退到后端 `/api/tts`（讯飞在线合成）
 *
 * `vcn` 用于中文等 TTS 发音人场景，传了 `vcn` 就不查语音包。
 */

import { resolveVoiceAudio } from './voicePackage'

export interface Pronunciation {
  /** 播放并在结束后 resolve（出错同样 resolve，避免调用方卡住） */
  play(): Promise<void>
  /** 释放资源（TTS blob URL 需要 revoke） */
  dispose(): void
  /** 立即停止（暂停并让 play() 立即 resolve） */
  stop(): void
}

// 当前正在播放的发音 + 播发代号，用于「连播 / 换卡」时打断上一段
let active: Pronunciation | null = null
let generation = 0

function createAudioHandle(src: string, revoke: boolean): Pronunciation {
  const audio = new Audio(src)
  audio.preload = 'auto'
  let resolvePlay: (() => void) | null = null
  let revoked = false

  const handle: Pronunciation = {
    play: () =>
      new Promise<void>((resolve) => {
        active = handle
        resolvePlay = resolve
        const finish = () => {
          resolvePlay = null
          if (active === handle) active = null
          resolve()
        }
        audio.onended = finish
        audio.onerror = finish
        audio.play().catch(finish)
      }),
    dispose: () => {
      if (active === handle) active = null
      if (revoke && !revoked) {
        revoked = true
        URL.revokeObjectURL(src)
      }
    },
    stop: () => {
      audio.pause()
      if (active === handle) active = null
      const resolve = resolvePlay
      resolvePlay = null
      resolve?.()
    },
  }
  return handle
}

/** 打断当前播放并递增代号，返回本次代号。 */
function interrupt(): number {
  generation += 1
  active?.stop()
  return generation
}

async function playOnce(text: string, vcn: string | undefined, gen: number): Promise<void> {
  const handle = await preparePronunciation(text, vcn)
  if (!handle) return
  // 预备期间被新的播放打断，则丢弃这段
  if (gen !== generation) {
    handle.dispose()
    return
  }
  try {
    await handle.play()
  } finally {
    handle.dispose()
  }
}

/**
 * 预备一段发音。可提前调用（例如并行预取两段音频）以减少播放间隔。
 * 既没有语音包也没有 TTS 时返回 null。
 */
export async function preparePronunciation(
  text: string,
  vcn?: string,
): Promise<Pronunciation | null> {
  const trimmed = text.trim()
  if (!trimmed) return null

  // 1) 语音包真人录音优先（仅英文场景）
  if (!vcn) {
    const recorded = resolveVoiceAudio(trimmed)
    if (recorded) return createAudioHandle(recorded, false)
  }

  // 2) 回退后端 TTS
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed, ...(vcn ? { vcn } : {}) }),
    })
    if (!res.ok) return null
    return createAudioHandle(URL.createObjectURL(await res.blob()), true)
  } catch {
    return null
  }
}

/** 播放一次。 */
export async function playPronunciation(text: string, vcn?: string): Promise<void> {
  await playOnce(text, vcn, interrupt())
}

/** 同一段发音连续播放 `times` 遍（卡片出现时自动连播用）。 */
export async function playPronunciationTimes(
  text: string,
  times: number,
  vcn?: string,
): Promise<void> {
  const gen = interrupt()
  for (let i = 0; i < times; i++) {
    if (gen !== generation) return
    await playOnce(text, vcn, gen)
  }
}

/** 停止当前播放（换卡、离开答题态时调用）。 */
export function stopPronunciation(): void {
  interrupt()
}
