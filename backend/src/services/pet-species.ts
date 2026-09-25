/**
 * 宠物种类与成长阶段（单一事实来源）
 * ------------------------------------------------------------------
 * 阶段的**名称与阈值**在这里定义一次，各宠物只提供自己的 emoji 线；
 * `GET /api/pet/:studentId` 返回某种类的完整阶段列表，前端据此渲染，
 * 不再各自维护一份「种类 → 阶段」映射。
 */

export interface PetStage {
  name: string
  emoji: string
  min_words: number
}

export interface PetSpecies {
  id: string
  name: string
  /** 该种类的口头禅，如猫「喵~」 */
  call: string
  /** 7 个阶段的 emoji，索引即阶段号；0 阶段所有种类统一为神秘蛋 */
  emojis: string[]
}

/** 7 个阶段的中文名（所有种类共用） */
export const STAGE_NAMES = ['神秘蛋', '幼崽', '少年', '青年', '成年', '觉醒', '传说']

/** 各阶段所需的「已引入词数」（所有种类共用，递增） */
export const STAGE_MIN_WORDS = [0, 10, 30, 60, 100, 200, 250]

/** 未选择种类时的兜底阶段 emoji（与现有首页占位一致） */
export const DEFAULT_STAGE_EMOJI = '🥚'

/** 可选的宠物种类（顺序即选择页展示顺序） */
export const PET_SPECIES: PetSpecies[] = [
  { id: 'cat',   name: '小猫', call: '喵~',  emojis: ['🥚', '🐱', '😺', '😸', '🐈', '🐯', '🦁'] },
  { id: 'cow',   name: '小牛', call: '哞~',  emojis: ['🥚', '🐮', '🐄', '🐂', '🐃', '🦬', '🐉'] },
  { id: 'chick', name: '小鸡', call: '叽叽', emojis: ['🥚', '🐣', '🐥', '🐔', '🐓', '🦅', '🐦‍🔥'] },
]

const SPECIES_BY_ID = new Map(PET_SPECIES.map(s => [s.id, s]))

/** 是否为已知种类 id */
export function isSpeciesId(id: unknown): id is string {
  return typeof id === 'string' && SPECIES_BY_ID.has(id)
}

/** 某种类的完整阶段列表；未选择 / 未知种类返回 null */
export function stagesFor(speciesId: string | null | undefined): PetStage[] | null {
  if (!isSpeciesId(speciesId)) return null
  const species = SPECIES_BY_ID.get(speciesId)!
  return species.emojis.map((emoji, i) => ({
    name: STAGE_NAMES[i],
    emoji,
    min_words: STAGE_MIN_WORDS[i],
  }))
}

/** 按已引入词数计算阶段索引（0~6）；负数 / 非数字按 0 阶段处理 */
export function stageIndexFor(introduced: number): number {
  if (!Number.isFinite(introduced) || introduced < 0) return 0
  for (let i = STAGE_MIN_WORDS.length - 1; i >= 0; i--) {
    if (introduced >= STAGE_MIN_WORDS[i]) return i
  }
  return 0
}

/** 种类口头禅（猫「喵~」/ 牛「哞~」/ 鸡「叽叽」）；未选择 / 未知返回 null */
export function speciesCall(speciesId: string | null | undefined): string | null {
  if (!isSpeciesId(speciesId)) return null
  return SPECIES_BY_ID.get(speciesId)!.call
}
