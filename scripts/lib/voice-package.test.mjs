import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildVoicePackage } from './voice-package.mjs'

/** 模拟「英语朗读宝」接口返回的最小载荷 */
function payload() {
  return {
    info: { version: '沪教版（三起）', book_name: '(新)三年级上册' },
    words: [
      {
        lesson_id: 1,
        title: 'Unit 1 How do we feel?',
        words: [
          {
            word: '  happy ',
            chinese: '开心的',
            phonetic: 'ˈhæpi',
            sound_path: 'https://cdn/happy.mp3',
            image_path: 'https://cdn/happy.jpg',
          },
          {
            word: 'am',
            chinese: '是',
            phonetic: 'æm',
            sound_path: 'https://cdn/am.mp3',
            // 无 image_path：不应产生 image 字段
          },
        ],
      },
    ],
  }
}

test('buildVoicePackage 映射单词、音频与图片字段', () => {
  const { pack } = buildVoicePackage(payload(), {
    id: 'demo',
    name: '演示包',
    source: 'https://example.com/api',
  })

  assert.equal(pack.id, 'demo')
  assert.equal(pack.name, '演示包')
  assert.equal(pack.book, '沪教版（三起） (新)三年级上册')
  assert.equal(pack.source, 'https://example.com/api')
  assert.match(pack.generatedAt, /^\d{4}-\d{2}-\d{2}$/)

  assert.equal(pack.units.length, 1)
  assert.equal(pack.units[0].lessonId, 1)
  assert.equal(pack.units[0].title, 'Unit 1 How do we feel?')

  const [happy, am] = pack.units[0].words
  assert.deepEqual(happy, {
    word: 'happy', // 首尾空白已去除
    chinese: '开心的',
    phonetic: 'ˈhæpi',
    audio: 'https://cdn/happy.mp3',
    image: 'https://cdn/happy.jpg',
  })
  assert.deepEqual(am, {
    word: 'am',
    chinese: '是',
    phonetic: 'æm',
    audio: 'https://cdn/am.mp3',
  })
  assert.ok(!('image' in am), '缺失 image_path 时不写入 image 字段')
})

test('buildVoicePackage 省略缺失的可选字段', () => {
  const { pack } = buildVoicePackage(
    {
      info: { version: 'X' },
      words: [{ lesson_id: 2, title: 'U2', words: [{ word: 'go', sound_path: 'https://cdn/go.mp3' }] }],
    },
    { id: 'x', name: 'x', source: 's' },
  )

  assert.equal(pack.book, 'X')
  assert.deepEqual(pack.units[0].words[0], { word: 'go', audio: 'https://cdn/go.mp3' })
})

test('buildVoicePackage 统计单词总数', () => {
  const { total } = buildVoicePackage(payload(), { id: 'd', name: 'd', source: 's' })
  assert.equal(total, 2)
})
