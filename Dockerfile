# ─────────────────────────────────────────────────────────────
# Stage 1: 构建前端静态文件
# ─────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

# 子路径部署时传入，如：docker build --build-arg VITE_BASE_URL=/word-master/ .
# 默认 / 表示根路径部署
ARG VITE_BASE_URL=/
ENV VITE_BASE_URL=$VITE_BASE_URL

# 前端页面显示的版本号（短 SHA），默认 unknown 表示未注入
ARG VITE_GIT_SHA=unknown

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./

# 版本号注入：由构建方传入，例如
#   docker build --build-arg VITE_GIT_SHA=$(git rev-parse --short HEAD) .
#
# 不在这里 apt-get install git + COPY .git 自己算，原因：
#   1) 省掉 apt-get，不再依赖可访问的 Debian 索引（国内网络拉 Packages 易断）
#   2) 不再要求构建上下文包含真实 .git 目录，git worktree 里也能直接构建
#   3) 少一层镜像，构建更快
RUN echo "VITE_GIT_SHA=${VITE_GIT_SHA}" >> .env

RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: 编译后端 TypeScript + 安装生产依赖
#   使用 node:20-slim（glibc），better-sqlite3 可直接下载预编译包，
#   无需 python3/make/g++
# ─────────────────────────────────────────────────────────────
FROM node:20-slim AS backend-build

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build
# 移除 devDependencies，保留 native 模块
RUN npm prune --omit=dev

# ─────────────────────────────────────────────────────────────
# Stage 3: 最终运行镜像
# ─────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# 后端编译产物
COPY --from=backend-build /app/backend/dist       ./dist
# 生产依赖（含已编译的 better-sqlite3）
COPY --from=backend-build /app/backend/node_modules ./node_modules
# 前端构建产物（backend 在生产模式下托管）
COPY --from=frontend-build /app/frontend/dist     ./frontend-dist

# SQLite 数据目录（挂载持久卷使用）
RUN mkdir -p data

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
