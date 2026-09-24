# 本地开发指南

本文档适合想要修改源码、参与贡献或二次开发的开发者。

普通用户请直接参考 [README](../README.md#docker-部署) 的 Docker 部署章节。

---

## 环境要求

- Node.js 20+
- npm 10+

---

## 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

---

## 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`：

```env
# 讯飞语音（STT / TTS）
XUNFEI_APP_ID=你的AppID
XUNFEI_API_KEY=你的APIKey
XUNFEI_API_SECRET=你的APISecret

# DeepSeek（AI 例句生成，可选）
DEEPSEEK_API_KEY=你的APIKey

# 子路径部署（可选，根路径部署无需修改）
# 需与构建镜像时的 --build-arg VITE_BASE_URL 保持一致
APP_BASE_PATH=/

# 数据库路径（默认 backend/data/word-master.db）
# DB_PATH=./data/word-master.db
```

> 讯飞语音非必须，不配置时语音输入和朗读功能不可用，其余功能正常。

---

## 启动开发服务

```bash
# 根目录，同时启动前后端
npm run dev

# 或分别启动
cd backend && npm run dev   # 后端 http://localhost:3000
cd frontend && npm run dev  # 前端 http://localhost:5173
```

前端 dev server 内置代理，`/api/*` 请求自动转发到后端 `:3000`。

---

## 导入词表

在 `单词本` 页面点击 `+` 导入 `.txt` 文件，格式：

```
apple 苹果
banana 香蕉
have a good time 玩得开心
```

每行一条，英文与中文之间用空格分隔。

---

## 语音包（真人录音）

播放单词发音时，会优先命中**语音包**里的真人录音（与教材同步），未命中才回退讯飞 TTS。
语音包数据存放在 `frontend/src/data/voice-packages/<id>.json`，只记录每个单词的远程 MP3 地址，不下载音频文件。

### 生成 / 更新语音包

语音包由脚本从「英语朗读宝」公开接口生成，在仓库根目录执行：

```bash
# 已内置沪教版（三起）三年级上册（id: hjbsz-sanshang）
npm run fetch:voice-package

# 新增其它教材：指定 id / 名称 / 版本 tag / 学期 / 年级 / 学段
node scripts/fetch-voice-package.mjs \
  --id hjbsz-sanshang --name "沪教版（三起）(新)三年级上册" \
  --version-tag hjbsz --term 1 --grade 3 --stage 1
```

| 参数 | 说明 |
|------|------|
| `--id` | 语音包标识，同时作为输出文件名 |
| `--name` | 展示名称 |
| `--version-tag` | 教材版本 tag（如 `hjbsz` = 沪教版（三起）） |
| `--term` | 学期：`1`=上册，`2`=下册，`3`=全册 |
| `--grade` | 年级：`1`~`9` |
| `--stage` | 学段：`1`=小学，`2`=初中，`3`=高中 |
| `--out` | 可选，输出路径 |

生成后把新 JSON import 到 `frontend/src/data/voice-packages/index.ts` 的 `VOICE_PACKAGES` 数组即可生效。

### 匹配规则与回退

`frontend/src/utils/voicePackage.ts` 会把单词归一化（转小写、压缩空白、去掉结尾 `. ! ?`）后建索引，
所以 `Good morning.`、`Hi.`、`a (an)` 这类带标点/括号的词也能命中。
调用 `playPronunciation()`（`frontend/src/utils/pronunciation.ts`）时：命中语音包 → 播放远程 MP3；未命中 → `POST /api/tts`。

> ⚠️ 当前语音包直接流式播放 CDN 上的 MP3，仍需联网。
> 若要做成真正可断网使用的离线包，把生成结果里的 `audio` 改成本地路径，
> 并把 MP3 下载到 `frontend/public/audio/<id>/` 后随代码一起提交即可。

---

## 测试

```bash
cd backend

# 运行所有测试
npm test

# 监听模式（开发时实时反馈）
npm run test:watch

# 生成覆盖率报告（输出到 backend/coverage/）
npm run test:coverage
```

测试覆盖核心业务逻辑：

- 艾宾浩斯间隔计算
- 今日任务统计（新词 / 复习词 / 剩余配额）
- 计划 Session 完整流程（开始 → 答题 → 完成 → 掌握度写入）
- 中途退出再进入的补偿逻辑
- 首次正确率计算

修复 Bug 时请遵循 [Bug 修复流程](.github/prompts/bugfix.prompt.md)：先写测试复现 Bug，验证测试失败后再修改代码。

---

## 项目结构

```
word-master/
├── backend/                    # Express API 服务
│   ├── src/
│   │   ├── app.ts              # Express 应用（路由 + 中间件）
│   │   ├── index.ts            # 入口（监听端口 + 预热语义模型）
│   │   ├── routes/             # API 路由
│   │   │   ├── tasks.ts        # 今日任务、艾宾浩斯调度
│   │   │   ├── quiz.ts         # 测验 session、答题、finish
│   │   │   ├── pet.ts          # 宠物系统
│   │   │   ├── wordbooks.ts    # 单词本 CRUD + 导入
│   │   │   ├── plans.ts        # 学习计划
│   │   │   ├── students.ts     # 学生管理
│   │   │   ├── tts.ts          # TTS 代理
│   │   │   ├── stt.ts          # STT 代理
│   │   │   └── semantic.ts     # 语义匹配接口
│   │   ├── services/
│   │   │   ├── xunfei/         # 讯飞语音（auth / stt / tts）
│   │   │   ├── semantic.ts     # 本地语义模型推理
│   │   │   └── deepseek.ts     # AI 例句生成
│   │   └── db/
│   │       ├── client.ts       # better-sqlite3 单例
│   │       └── schema.ts       # 建表 + 幂等 ALTER TABLE
│   ├── scripts/                # 工具脚本（生成例句、探测模型等）
│   └── vitest.config.ts        # 测试配置（内存数据库隔离）
├── frontend/                   # React 单页应用
│   └── src/
│       ├── pages/              # 页面组件
│       ├── components/         # 通用组件（MasteryBar / TtsButton / VoiceInput）
│       ├── data/voice-packages/# 语音包数据（单词 → 真人录音 URL）
│       ├── hooks/              # 数据 hooks
│       ├── utils/              # 工具（发音播放 / 语音包查询 / 音效）
│       └── api/index.ts        # 所有后端接口封装
├── scripts/
│   └── fetch-voice-package.mjs # 从英语朗读宝生成语音包数据
├── docs/                       # 设计文档（数据库 schema / UX 设计）
├── Dockerfile                  # 三阶段构建
├── docker-compose.yml          # 生产部署配置
└── .github/
    ├── workflows/
    │   ├── ci.yml              # PR / push 触发：类型检查 + 测试 + Docker 构建验证
    │   └── docker-publish.yml  # CI 通过后自动构建推送镜像到 ghcr.io
    └── prompts/
        └── bugfix.prompt.md    # Bug 修复工作流
```

---

## 生产构建（本地验证 Docker 镜像）

```bash
# 在项目根目录构建并启动
docker compose -f docker-compose.yml up --build

# 访问 http://localhost:3000
```
