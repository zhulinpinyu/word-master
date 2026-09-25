/**
 * 语音包数据转换
 * ------------------------------------------------------------------
 * 把「英语朗读宝」接口的原始载荷转成前端语音包 JSON 的结构。
 * 纯函数、无副作用，便于单元测试；字段缺失时省略，不写入空值。
 *
 * 每个单词记录：
 *   - `audio`：真人录音 MP3 远程地址（sound_path）
 *   - `image`：配套插图远程地址（image_path）
 */

/**
 * @param {{ info?: object, words?: Array }} payload 接口返回的 data 部分
 * @param {{ id: string, name: string, source: string }} meta 语音包元信息
 * @returns {{ pack: object, total: number }} 语音包对象与单词总数
 */
export function buildVoicePackage(payload, meta) {
  const { info = {}, words: units = [] } = payload ?? {}
  let total = 0

  const unitsOut = units.map((unit) => {
    const words = (unit.words || []).map((word) => {
      total++
      const entry = { word: String(word.word).trim() }
      if (word.phonetic) entry.phonetic = word.phonetic
      if (word.chinese) entry.chinese = word.chinese
      entry.audio = word.sound_path
      if (word.image_path) entry.image = word.image_path
      return entry
    })
    return { lessonId: unit.lesson_id, title: unit.title, words }
  })

  return {
    pack: {
      id: meta.id,
      name: meta.name,
      book: [info.version, info.book_name].filter(Boolean).join(' '),
      source: meta.source,
      generatedAt: new Date().toISOString().slice(0, 10),
      units: unitsOut,
    },
    total,
  }
}
