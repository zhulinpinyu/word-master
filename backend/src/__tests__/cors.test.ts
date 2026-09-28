/**
 * CORS 白名单测试
 *
 * 回归背景：生产环境后端自己托管前端，浏览器访问 http://<host>:3000 时，
 * 对同源的 POST/PUT/DELETE 也会带上 Origin 头。原实现的 origin 回调只放行了
 * 开发用的 :5173 与 CORS_ORIGIN，导致所有写操作被判为跨域并抛错 → 500。
 */
import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import app from '../app'
import { setupTestDb } from './helpers'

setupTestDb()

afterEach(() => {
  delete process.env.CORS_ORIGIN
})

/** 发一个带 Origin / Host 的请求，返回响应 */
function ping(origin?: string, host?: string, extraHeaders: Record<string, string> = {}) {
  const req = request(app).get('/api/health')
  if (origin) req.set('Origin', origin)
  if (host) req.set('Host', host)
  for (const [k, v] of Object.entries(extraHeaders)) req.set(k, v)
  return req
}

describe('CORS 同源放行', () => {
  it('Origin 与 Host 一致（局域网 IP 直连）→ 放行', async () => {
    const res = await ping('http://192.168.1.50:3000', '192.168.1.50:3000')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('http://192.168.1.50:3000')
  })

  it('Origin 与 Host 一致（域名直连）→ 放行', async () => {
    const res = await ping('http://nas.local:3000', 'nas.local:3000')
    expect(res.status).toBe(200)
  })

  it('HTTPS 反代终止、Host 一致 → 放行', async () => {
    const res = await ping('https://word.example.com', 'word.example.com')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('https://word.example.com')
  })

  it('同源 POST 也放行（浏览器写操作带 Origin 的场景）', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Origin', 'http://192.168.1.50:3000')
      .set('Host', '192.168.1.50:3000')
      .send({ name: '同源学生' })
    expect(res.status).toBe(201)
  })

  it('无 Origin 头（同源 GET / curl）→ 放行', async () => {
    const res = await ping()
    expect(res.status).toBe(200)
  })
})

describe('CORS 显式白名单', () => {
  it('CORS_ORIGIN 命中的跨域来源 → 放行', async () => {
    process.env.CORS_ORIGIN = 'https://front.example.com'
    const res = await ping('https://front.example.com', 'api.example.com')
    expect(res.status).toBe(200)
  })

  it('开发用 Vite dev server（:5173）→ 放行', async () => {
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://192.168.1.50:5173']) {
      const res = await ping(origin, 'localhost:3000')
      expect(res.status, origin).toBe(200)
    }
  })
})

describe('CORS 非同源拒绝', () => {
  it('陌生跨域来源 → 拒绝', async () => {
    const res = await ping('https://evil.example.com', '192.168.1.50:3000')
    expect(res.status).toBe(500)
  })

  it('Host 相同但端口不同 → 不算同源', async () => {
    const res = await ping('http://192.168.1.50:8080', '192.168.1.50:3000')
    expect(res.status).toBe(500)
  })

  it('CORS_ORIGIN 有值时，不匹配的跨域来源仍被拒绝', async () => {
    process.env.CORS_ORIGIN = 'https://front.example.com'
    const res = await ping('https://other.example.com', 'api.example.com')
    expect(res.status).toBe(500)
  })

  it('畸形 Origin 不会抛异常，按非同源拒绝', async () => {
    const res = await ping('not-a-url', '192.168.1.50:3000')
    expect(res.status).toBe(500)
  })
})
