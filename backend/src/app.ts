import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { initSchema } from './db/schema'
import studentsRouter from './routes/students'
import wordbooksRouter from './routes/wordbooks'
import quizRouter from './routes/quiz'
import recordsRouter from './routes/records'
import ttsRouter from './routes/tts'
import sttRouter from './routes/stt'
import semanticRouter from './routes/semantic'
import plansRouter from './routes/plans'
import tasksRouter from './routes/tasks'
import petRouter from './routes/pet'

dotenv.config()

const app = express()

/** Vite dev server 的 Origin（本地开发、以及手机上连开发机调试时使用） */
const DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+):5173$/

/**
 * 判断 Origin 是否与请求自身同源。
 *
 * 浏览器对同源的 POST/PUT/DELETE 同样会带 Origin 头（GET/HEAD 不带），
 * 而生产环境由后端自己托管前端、走的就是同源，因此必须放行，
 * 否则所有写操作都会被后面的白名单判为跨域并报错。
 * 只比较 host（含端口）、忽略协议，以兼容反向代理终止 TLS 的场景。
 */
function isSameOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false // 畸形 Origin，按非同源处理
  }
}

app.use(cors((req, cb) => {
  const origin = req.headers.origin
  const extra = process.env.CORS_ORIGIN

  // 同源判定需要 req.headers.host，所以用 (req, cb) 形式而非纯 origin 回调
  const allowed = Boolean(
    !origin ||
    isSameOrigin(origin, req.headers.host) ||
    (extra && origin === extra) ||
    DEV_ORIGIN_PATTERN.test(origin)
  )

  if (!allowed) return cb(new Error('Not allowed by CORS'))
  cb(null, { origin: true }) // origin: true → 回显请求方 Origin
}))
app.use(express.json())

// 初始化数据库表结构
initSchema()

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

app.use('/api/students', studentsRouter)
app.use('/api/wordbooks', wordbooksRouter)
app.use('/api/quiz', quizRouter)
app.use('/api/records', recordsRouter)
app.use('/api/tts', ttsRouter)
app.use('/api/stt', sttRouter)
app.use('/api/semantic', semanticRouter)
app.use('/api/plans', plansRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/pet', petRouter)

// 生产模式：托管前端构建产物，所有非 /api 请求返回 index.html（SPA fallback）
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.resolve(__dirname, '../frontend-dist')
  // 子路径部署时通过 APP_BASE_PATH 指定挂载路径
  // 需与前端构建时传入的 VITE_BASE_URL 保持一致，默认根路径 /
  const basePath = (process.env.APP_BASE_PATH || '/').replace(/\/+$/, '') || ''
  app.use(basePath, express.static(frontendDist))
  app.get(`${basePath}/*`, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
}

export default app
