/**
 * pet 路由测试
 *
 * 重点覆盖「宠物种类选择」：
 * - GET /api/pet/species 目录
 * - 未选择种类时的兜底（species/stages = null，stage 0，🥚）
 * - POST /api/pet/:id/species 一次性选择（400 / 409）
 * - 选择后阶段按 7 档阈值计算
 * - 老数据兼容：补选种类后其余进度分毫不变
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app'
import db from '../db/client'
import { setupTestDb, createStudent } from '../__tests__/helpers'
import { STAGE_NAMES, STAGE_MIN_WORDS } from '../services/pet-species'

setupTestDb()

/** 造 n 条「已引入」的掌握度记录 */
function introduce(studentId: number, n: number) {
  for (let i = 0; i < n; i++) {
    const itemId = Number(db.prepare(
      "INSERT INTO items (type, english, chinese) VALUES ('word', ?, ?)",
    ).run(`w_${studentId}_${i}`, `词${i}`).lastInsertRowid)
    db.prepare(
      'INSERT INTO student_mastery (student_id, item_id, introduced_date) VALUES (?, ?, 20260101)',
    ).run(studentId, itemId)
  }
}

describe('GET /api/pet/species', () => {
  it('返回三种宠物，每个 7 阶段，0 阶段统一神秘蛋', async () => {
    const res = await request(app).get('/api/pet/species')
    expect(res.status).toBe(200)
    expect(res.body.map((s: { id: string }) => s.id)).toEqual(['cat', 'cow', 'chick'])
    for (const s of res.body) {
      expect(s.stages).toHaveLength(7)
      expect(s.stages.map((x: { name: string }) => x.name)).toEqual(STAGE_NAMES)
      expect(s.stages.map((x: { min_words: number }) => x.min_words)).toEqual(STAGE_MIN_WORDS)
      expect(s.stages[0].emoji).toBe('🥚')
    }
  })

  it('不会被 /:studentId 抢路由', async () => {
    const res = await request(app).get('/api/pet/species')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('GET /api/pet/:studentId — 未选择种类', () => {
  it('首次访问：自动建宠物记录，species/stages 为 null，stage 0 兜底为 🥚', async () => {
    const studentId = createStudent('新用户')
    const res = await request(app).get(`/api/pet/${studentId}`)
    expect(res.status).toBe(200)
    expect(res.body.species).toBeNull()
    expect(res.body.stages).toBeNull()
    expect(res.body.stage).toBe(0)
    expect(res.body.stage_name).toBe('神秘蛋')
    expect(res.body.stage_emoji).toBe('🥚')
    expect(res.body.can_evolve).toBe(false)
    expect(res.body.next_stage_words).toBeNull()
  })

  it('学生不存在返回 404', async () => {
    const res = await request(app).get('/api/pet/999999')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/pet/:studentId/species', () => {
  it('合法种类：一次性写入成功', async () => {
    const studentId = createStudent('选猫')
    const res = await request(app).post(`/api/pet/${studentId}/species`).send({ species: 'cat' })
    expect(res.status).toBe(200)
    expect(res.body.species).toBe('cat')

    const after = await request(app).get(`/api/pet/${studentId}`)
    expect(after.body.species).toBe('cat')
    expect(after.body.stages).toHaveLength(7)
    expect(after.body.stages[0]).toEqual({ name: '神秘蛋', emoji: '🥚', min_words: 0 })
    expect(after.body.stages[6].emoji).toBe('🦁')
  })

  it('重复选择返回 409，且不改变已选种类', async () => {
    const studentId = createStudent('选两次')
    await request(app).post(`/api/pet/${studentId}/species`).send({ species: 'cat' })
    const again = await request(app).post(`/api/pet/${studentId}/species`).send({ species: 'cow' })
    expect(again.status).toBe(409)
    const after = await request(app).get(`/api/pet/${studentId}`)
    expect(after.body.species).toBe('cat')
  })

  it('非法 / 缺失种类返回 400', async () => {
    const studentId = createStudent('非法')
    for (const body of [{ species: 'dog' }, { species: '' }, {}, { species: 123 }]) {
      const res = await request(app).post(`/api/pet/${studentId}/species`).send(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    const after = await request(app).get(`/api/pet/${studentId}`)
    expect(after.body.species).toBeNull()
  })

  it('学生不存在返回 404', async () => {
    const res = await request(app).post('/api/pet/999999/species').send({ species: 'cat' })
    expect(res.status).toBe(404)
  })
})

describe('选择种类后按 7 档阈值算阶段', () => {
  it.each([
    [0, 0, '🥚'],
    [9, 0, '🥚'],
    [10, 1, '🐱'],
    [29, 1, '🐱'],
    [30, 2, '😺'],
    [60, 3, '😸'],
    [100, 4, '🐈'],
    [200, 5, '🐯'],
    [249, 5, '🐯'],
    [250, 6, '🦁'],
  ])('已引入 %i 词 → 阶段 %i (%s)', async (introduced, stage, emoji) => {
    const studentId = createStudent(`阶段${introduced}`)
    introduce(studentId, introduced)
    await request(app).post(`/api/pet/${studentId}/species`).send({ species: 'cat' })
    const res = await request(app).get(`/api/pet/${studentId}`)
    expect(res.body.stage).toBe(stage)
    expect(res.body.stage_name).toBe(STAGE_NAMES[stage])
    expect(res.body.stage_emoji).toBe(emoji)
    expect(res.body.introduced_count).toBe(introduced)
  })

  it('下一阶段信息正确（少年 → 青年 @60）', async () => {
    const studentId = createStudent('下一阶段')
    introduce(studentId, 30)
    await request(app).post(`/api/pet/${studentId}/species`).send({ species: 'cow' })
    const res = await request(app).get(`/api/pet/${studentId}`)
    expect(res.body.stage).toBe(2)
    expect(res.body.next_stage_words).toBe(60)
    expect(res.body.can_evolve).toBe(false)
  })
})

describe('老数据兼容：补选种类后其余进度分毫不变', () => {
  it('有进度但 species=NULL 的老用户，补选后只多出种类', async () => {
    const studentId = createStudent('老用户')
    introduce(studentId, 43)

    // 首次 GET 建宠物记录，并写入一些进度字段
    const before = await request(app).get(`/api/pet/${studentId}`)
    expect(before.body.species).toBeNull()
    expect(before.body.stage).toBe(0) // 未选种类时占位显示蛋
    db.prepare(
      'UPDATE pet_status SET coins = 99, streak_days = 5, total_fed = 7, hunger = 66 WHERE student_id = ?',
    ).run(studentId)

    const set = await request(app).post(`/api/pet/${studentId}/species`).send({ species: 'cow' })
    expect(set.status).toBe(200)

    const after = await request(app).get(`/api/pet/${studentId}`)
    expect(after.body.species).toBe('cow')
    // 阶段按既有进度重算（43 词 → 少年），而不是从 0 开始
    expect(after.body.stage).toBe(2)
    expect(after.body.stage_name).toBe('少年')
    expect(after.body.stage_emoji).toBe('🐄')
    // 其余进度分毫不变
    expect(after.body.introduced_count).toBe(43)
    expect(after.body.coins).toBe(99)
    expect(after.body.streak_days).toBe(5)
    expect(after.body.total_fed).toBe(7)
    expect(after.body.hunger).toBe(66)
  })
})
