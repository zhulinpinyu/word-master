#!/usr/bin/env node
/**
 * 语音包数据生成器
 * ------------------------------------------------------------------
 * 从「英语朗读宝」(yyld.51jiaoxi.com) 的公开接口拉取某个教材的单词表，
 * 生成前端 `src/data/voice-packages/<id>.json` 语音包清单。
 *
 * 清单只记录每个单词的**远程音频 URL**（sound_path），不下载 MP3 文件。
 * 前端优先播放清单中的真人录音，未命中时回退到讯飞 TTS。
 *
 * 用法（在仓库根目录执行）：
 *   node scripts/fetch-voice-package.mjs \
 *     --id hjbsz-sanshang \
 *     --name "沪教版（三起）(新)三年级上册" \
 *     --version-tag hjbsz --term 1 --grade 3 --stage 1
 *
 * 参数说明：
 *   --id           语音包标识，同时作为输出文件名
 *   --name         展示名称
 *   --version-tag  教材版本 tag（如 hjbsz = 沪教版（三起））
 *   --term         学期：1=上册，2=下册，3=全册
 *   --grade        年级：1~9
 *   --stage        学段：1=小学，2=初中，3=高中
 *   --out          可选，输出路径（默认 frontend/src/data/voice-packages/<id>.json）
 *   --source-url   可选，覆盖接口地址（默认 https://api.suyang123.com/api）
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API_BASE = process.env.VOICE_API_BASE || 'https://api.suyang123.com/api'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      args[key] = 'true'
    } else {
      args[key] = next
      i++
    }
  }
  return args
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
for (const key of ['id', 'name', 'version-tag', 'term', 'grade', 'stage']) {
  if (!args[key]) fail(`缺少必填参数 --${key}`)
}

const params = new URLSearchParams({
  version_tag: args['version-tag'],
  term_id: args.term,
  grade_id: args.grade,
  stage_id: args.stage,
})
const apiUrl = `${API_BASE}/jxh5/yy/book/words?${params.toString()}`
const outPath = resolve(ROOT, args.out || `frontend/src/data/voice-packages/${args.id}.json`)

console.log(`→ 拉取接口：${apiUrl}`)

const res = await fetch(apiUrl, { headers: { Accept: 'application/json, text/plain, */*' } })
if (!res.ok) fail(`接口返回 HTTP ${res.status}`)
const payload = await res.json()
if (payload.code !== 200 || !payload.data) fail(`接口返回异常：code=${payload.code} msg=${payload.msg}`)

const { info, words: units } = payload.data
let total = 0
const unitsOut = (units || []).map((unit) => {
  const words = (unit.words || []).map((word) => {
    total++
    const entry = { word: String(word.word).trim() }
    if (word.phonetic) entry.phonetic = word.phonetic
    if (word.chinese) entry.chinese = word.chinese
    entry.audio = word.sound_path
    return entry
  })
  return { lessonId: unit.lesson_id, title: unit.title, words }
})

if (total === 0) fail('接口未返回任何单词')

const pack = {
  id: args.id,
  name: args.name,
  book: [info.version, info.book_name].filter(Boolean).join(' '),
  source: apiUrl,
  generatedAt: new Date().toISOString().slice(0, 10),
  units: unitsOut,
}

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8')

console.log(`✓ 已写入 ${outPath}`)
console.log(`  共 ${unitsOut.length} 个单元 / ${total} 个单词`)
