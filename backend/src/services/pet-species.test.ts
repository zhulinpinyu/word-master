/**
 * 宠物种类领域模块测试
 *
 * 覆盖：种类目录、7 阶段进化线、按已引入词数算阶段、种类口头禅。
 */
import { describe, it, expect } from 'vitest'
import {
  PET_SPECIES,
  STAGE_NAMES,
  STAGE_MIN_WORDS,
  isSpeciesId,
  stagesFor,
  stageIndexFor,
  speciesCall,
} from './pet-species'

describe('种类目录', () => {
  it('提供小猫 / 小牛 / 小鸡三种，且 id 唯一', () => {
    expect(PET_SPECIES.map(s => s.id)).toEqual(['cat', 'cow', 'chick'])
    expect(new Set(PET_SPECIES.map(s => s.id)).size).toBe(PET_SPECIES.length)
  })

  it('每个种类的 emoji 数量与阶段数一致（7）', () => {
    for (const s of PET_SPECIES) {
      expect(s.emojis).toHaveLength(STAGE_NAMES.length)
      expect(s.emojis).toHaveLength(STAGE_MIN_WORDS.length)
    }
  })

  it('0 阶段统一是神秘蛋', () => {
    for (const s of PET_SPECIES) expect(s.emojis[0]).toBe('🥚')
  })

  it('isSpeciesId 只认已知 id', () => {
    expect(isSpeciesId('cat')).toBe(true)
    expect(isSpeciesId('cow')).toBe(true)
    expect(isSpeciesId('dog')).toBe(false)
    expect(isSpeciesId(null)).toBe(false)
    expect(isSpeciesId(undefined)).toBe(false)
    expect(isSpeciesId('')).toBe(false)
  })
})

describe('stagesFor', () => {
  it('返回 7 个阶段，名称 / 阈值 / emoji 对应正确', () => {
    const stages = stagesFor('cat')
    expect(stages).not.toBeNull()
    expect(stages!).toHaveLength(7)
    expect(stages!.map(s => s.name)).toEqual(STAGE_NAMES)
    expect(stages!.map(s => s.min_words)).toEqual(STAGE_MIN_WORDS)
    expect(stages![0]).toEqual({ name: '神秘蛋', emoji: '🥚', min_words: 0 })
    expect(stages![6]).toEqual({ name: '传说', emoji: '🦁', min_words: 250 })
  })

  it('不同种类只有 emoji 不同', () => {
    const cat = stagesFor('cat')!
    const cow = stagesFor('cow')!
    const chick = stagesFor('chick')!
    expect(cow[1].emoji).toBe('🐮')
    expect(chick[1].emoji).toBe('🐣')
    // 末段「传说」形态：小鸡进化成凤凰
    expect(chick[6].emoji).toBe('🐦‍🔥')
    expect(cow.map(s => [s.name, s.min_words])).toEqual(cat.map(s => [s.name, s.min_words]))
    expect(chick.map(s => [s.name, s.min_words])).toEqual(cat.map(s => [s.name, s.min_words]))
  })

  it('未选择 / 未知种类返回 null', () => {
    expect(stagesFor(null)).toBeNull()
    expect(stagesFor(undefined)).toBeNull()
    expect(stagesFor('dog')).toBeNull()
  })
})

describe('stageIndexFor', () => {
  it('按阈值边界取阶段（含每一档的临界值）', () => {
    const cases: [number, number][] = [
      [0, 0], [9, 0],
      [10, 1], [29, 1],
      [30, 2], [59, 2],
      [60, 3], [99, 3],
      [100, 4], [199, 4],
      [200, 5], [249, 5],
      [250, 6], [9999, 6],
    ]
    for (const [introduced, expected] of cases) {
      expect(stageIndexFor(introduced), `introduced=${introduced}`).toBe(expected)
    }
  })

  it('负数或非数字按 0 阶段处理', () => {
    expect(stageIndexFor(-5)).toBe(0)
    expect(stageIndexFor(NaN)).toBe(0)
  })
})

describe('speciesCall', () => {
  it('返回各自动物叫声', () => {
    expect(speciesCall('cat')).toBe('喵~')
    expect(speciesCall('cow')).toBe('哞~')
    expect(speciesCall('chick')).toBe('叽叽')
  })

  it('未选择 / 未知种类返回 null', () => {
    expect(speciesCall(null)).toBeNull()
    expect(speciesCall('dog')).toBeNull()
  })
})
