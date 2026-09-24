import { useState } from 'react'
import { playPronunciation } from '@/utils/pronunciation'

interface Props {
  text: string
  vcn?: string   // 发音人：默认 x4_yezi（中英通用）；中文也可显式传 'x4_yezi'
  className?: string
}

export default function TtsButton({ text, vcn, className = '' }: Props) {
  const [playing, setPlaying] = useState(false)

  const handlePlay = async () => {
    if (playing) return
    setPlaying(true)
    // 语音包真人录音优先，未命中回退讯飞 TTS
    try {
      await playPronunciation(text, vcn)
    } finally {
      setPlaying(false)
    }
  }

  return (
    <button
      onClick={handlePlay}
      disabled={playing}
      title="朗读发音"
      className={`rounded-full flex items-center justify-center transition-colors disabled:opacity-50
        ${playing ? 'bg-primary-200 text-primary-700' : 'bg-primary-100 text-primary-600 hover:bg-primary-200'}
        ${className}`}
    >
      {playing ? '⏸' : '🔊'}
    </button>
  )
}
