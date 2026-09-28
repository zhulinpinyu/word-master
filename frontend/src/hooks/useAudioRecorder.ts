import { useState, useRef, useCallback } from 'react'

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Int16Array[]>([])
  const onChunkRef = useRef<((buf: ArrayBuffer) => void) | null>(null)

  const start = useCallback(async (onChunk?: (buf: ArrayBuffer) => void) => {
    onChunkRef.current = onChunk ?? null
    // 非安全上下文下 navigator.mediaDevices 为 undefined，
    // 直接调用会抛 TypeError（"Cannot read properties of undefined"），
    // 这里给出可读的错误名，便于上层区分原因
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException(
        '当前环境不支持麦克风采集（需要 HTTPS 或 localhost）',
        'NotSupportedError',
      )
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const ctx = new AudioContext({ sampleRate: 16000 })
    const source = ctx.createMediaStreamSource(stream)
    // bufferSize=4096 对应约 256ms；使用单声道输入输出
    const processor = ctx.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (e) => {
      const f32 = e.inputBuffer.getChannelData(0)
      const i16 = new Int16Array(f32.length)
      for (let i = 0; i < f32.length; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32767))
      }
      if (onChunkRef.current) {
        onChunkRef.current(i16.buffer)
      } else {
        chunksRef.current.push(new Int16Array(i16))
      }
    }

    source.connect(processor)
    processor.connect(ctx.destination)

    streamRef.current = stream
    contextRef.current = ctx
    processorRef.current = processor
    chunksRef.current = []
    setRecording(true)
  }, [])

  const stop = useCallback((): ArrayBuffer => {
    onChunkRef.current = null
    processorRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    contextRef.current?.close()

    const total = chunksRef.current.reduce((s, c) => s + c.length, 0)
    const out = new Int16Array(total)
    let offset = 0
    for (const c of chunksRef.current) {
      out.set(c, offset)
      offset += c.length
    }

    chunksRef.current = []
    setRecording(false)
    return out.buffer
  }, [])

  return { recording, start, stop }
}
