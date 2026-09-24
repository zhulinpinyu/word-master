import WebSocket from 'ws'
import { buildWsAuthUrl } from './auth'

/**
 * 讯飞在线语音合成 v2（WebSocket API）
 * 文档：https://www.xfyun.cn/doc/tts/online_tts/API.html
 *
 * 默认发音人：x4_yezi（叶子 X4，中英混读）
 *
 * 注：免费基础发音人只有 xiaoyan / aisjiuxu / aisxping / aisjinger / aisbabyxu，
 * 均为中文声线；讯飞没有免费的纯英文音色（付费音库约 2 万/年）。
 * 注：超拟人接口（super smart-tts）需单独授权，暂用此标准接口。
 */
export async function synthesize(
  text: string,
  vcn = 'x4_yezi',
): Promise<Buffer> {
  const APP_ID = process.env.XUNFEI_APP_ID!
  const url = buildWsAuthUrl('tts-api.xfyun.cn', '/v2/tts')

  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(url)
    const chunks: Buffer[] = []

    ws.on('open', () => {
      ws.send(JSON.stringify({
        common: { app_id: APP_ID },
        business: {
          aue: 'lame',
          auf: 'audio/L16;rate=16000',
          vcn,
          speed: 50,
          volume: 50,
          pitch: 50,
          tte: 'utf8',
        },
        data: {
          status: 2,
          text: Buffer.from(text).toString('base64'),
        },
      }))
    })

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          code: number
          message: string
          data?: { audio?: string; status?: number }
        }
        if (msg.code !== 0) {
          ws.close()
          reject(new Error(`Xunfei TTS: code=${msg.code}, msg=${msg.message}`))
          return
        }
        if (msg.data?.audio) {
          chunks.push(Buffer.from(msg.data.audio, 'base64'))
        }
        if (msg.data?.status === 2) {
          ws.close()
          resolve(Buffer.concat(chunks))
        }
      } catch (e) {
        ws.close()
        reject(e)
      }
    })

    ws.on('error', reject)

    const timer = setTimeout(() => {
      ws.close()
      reject(new Error('Xunfei TTS timeout'))
    }, 30000)
    ws.on('close', () => clearTimeout(timer))
  })
}
