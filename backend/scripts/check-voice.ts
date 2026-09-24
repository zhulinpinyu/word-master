/**
 * 讯飞语音密钥自检脚本
 *
 * 用法（在 backend 目录下运行）：
 *   npx tsx scripts/check-voice.ts
 *
 * 依次检查：
 *   1. .env 里的讯飞三项密钥是否已填写（排除占位符）
 *   2. TTS 在线语音合成：英文（aisxping）+ 中文（xiaoyan）能否合成出音频
 *   3. STT 语音听写大模型：WebSocket 鉴权握手能否成功
 */
import 'dotenv/config'
import { synthesize } from '../src/services/xunfei/tts'
import { createXunfeiSttSession } from '../src/services/xunfei/stt'

const PLACEHOLDERS = new Set([
  'your_app_id_here',
  'your_api_key_here',
  'your_api_secret_here',
])

let failed = 0
const ok = (msg: string) => console.log(`  ✅ ${msg}`)
const bad = (msg: string) => { failed++; console.log(`  ❌ ${msg}`) }
const info = (msg: string) => console.log(`     ${msg}`)

async function main() {
// ── 1. 密钥是否齐备 ─────────────────────────────────────────────
console.log('\n[1/3] 检查 .env 中的讯飞密钥')
const appId = process.env.XUNFEI_APP_ID ?? ''
const apiKey = process.env.XUNFEI_API_KEY ?? ''
const apiSecret = process.env.XUNFEI_API_SECRET ?? ''

for (const [name, value] of [
  ['XUNFEI_APP_ID', appId],
  ['XUNFEI_API_KEY', apiKey],
  ['XUNFEI_API_SECRET', apiSecret],
] as const) {
  if (!value || PLACEHOLDERS.has(value)) bad(`${name} 未填写（当前值：${value || '空'}）`)
  // 只报长度，不打印任何密钥片段，避免密钥内容进入终端输出 / 对话记录
  else ok(`${name} 已填写（长度 ${value.length}）`)
}

if (failed > 0) {
  console.log('\n密钥不完整，跳过后续检查。请编辑 backend/.env 后重试。\n')
  process.exit(1)
}

// ── 2. TTS ─────────────────────────────────────────────────────
console.log('\n[2/3] 检查 TTS（wss://tts-api.xfyun.cn/v2/tts）')
for (const [label, text, vcn] of [
  ['英文 aisxping', 'apple', 'aisxping'],
  ['中文 xiaoyan', '苹果', 'xiaoyan'],
] as const) {
  try {
    const audio = await synthesize(text, vcn)
    if (audio.length > 0) ok(`${label}："${text}" → ${audio.length} 字节 mp3`)
    else bad(`${label}：返回空音频`)
  } catch (e) {
    const msg = (e as Error).message
    bad(`${label}：${msg}`)
    if (msg.includes('401')) info('401 = 签名校验失败，检查 APIKey / APISecret 是否填错，或与服务不匹配')
    if (msg.includes('403')) info('403 = 时钟偏移过大，或控制台开了 IP 白名单')
    if (msg.includes('11200')) info('11200 = 发音人未授权。去控制台「在线语音合成 → 发音人授权管理」添加该音库')
    if (msg.includes('10005')) info('10005 = appid 授权失败，确认该应用已开通「在线语音合成」服务')
  }
}

// ── 3. STT 实际调用（喂 1 秒静音，看能否过授权校验）──────────
console.log('\n[3/3] 检查 STT 实际调用（wss://iat.cn-huabei-1.xf-yun.com/v1）')
const sttResult = await new Promise<string>((resolve) => {
  let settled = false
  const done = (v: string) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v) } }
  const session = createXunfeiSttSession(
    'zh_cn',
    (text) => done(`OK 识别成功，返回文本："${text}"`),
    (msg) => done(`FAIL ${msg}`),
  )
  const timer = setTimeout(() => { session.close(); done('TIMEOUT 无响应（15s）') }, 15_000)

  // 1 秒静音 PCM：16kHz / 16bit / 单声道 = 32000 字节，按 1024 字节 / 40ms 发送
  const silence = Buffer.alloc(32000)
  const CHUNK = 1024
  for (let off = 0; off < silence.length; off += CHUNK) {
    setTimeout(() => session.sendAudio(silence.subarray(off, off + CHUNK)), (off / CHUNK) * 40)
  }
  setTimeout(() => session.end(), (silence.length / CHUNK) * 40 + 200)
})

if (sttResult.startsWith('OK')) ok(sttResult.slice(3))
else bad(sttResult)
if (sttResult.includes('11201')) info('11201 = 该应用没有这个栏目（V2.0）的授权。检查控制台是否把「语音听写大模型（中英）V2.0」添加到了密钥所属的那个应用')
if (sttResult.includes('11200')) info('11200 = 功能未授权或授权到期')

// ── 汇总 ───────────────────────────────────────────────────────
console.log(failed === 0 ? '\n🎉 全部通过，语音功能可用\n' : `\n⚠️  有 ${failed} 项失败，见上方提示\n`)
process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
