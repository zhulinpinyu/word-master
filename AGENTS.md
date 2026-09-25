# AGENTS.md — 协作规范

本仓库的所有 AI Agent 改动都遵循以下工作流。提交信息与分支命名以 [`COMMIT_CONVENTION.md`](./COMMIT_CONVENTION.md) 为准，本文件补充**工作流**部分。

## 1. 永远先建 worktree + feature 分支

**不要直接在 `main` 上改代码。** 每项工作从 `main` 拉一个 feature 分支，并在独立 worktree 里进行：

```bash
git worktree add -b feat/<name> ../word-master.feat-<name> main
cd ../word-master.feat-<name>

# 复用主工作区的依赖（node_modules 已 gitignore，避免在每个 worktree 重复安装）
ln -s ../word-master/node_modules node_modules
ln -s ../word-master/frontend/node_modules frontend/node_modules
ln -s ../word-master/backend/node_modules backend/node_modules
```

- 分支命名：`feat/<name>`、`fix/<name>`（见 `COMMIT_CONVENTION.md`）。
- 收尾：工作区干净后 `git worktree remove ../word-master.feat-<name>`。

## 2. 用 Matt Pocock 的 skills 驱动流程

skills 位于 `~/.agents/skills/`，`ask-matt` 是路由入口。按工作规模选路：

| 场景 | 用什么 |
|------|--------|
| 需求/方向不清 | 先澄清再动手（`grill-with-docs`；或直接提问），**不要猜** |
| 小而清晰的功能 | `implement`：在既定接缝上 `tdd`（先红后绿），收尾 `code-review` 做「规范 + 规格」两轴审查 |
| 多会话大功能 | `to-spec` → `to-tickets` → 每个 ticket 一次 `implement` |
| 难排查的 bug | `diagnosing-bugs` |

## 3. 提交前强制检查

按 `COMMIT_CONVENTION.md` 的顺序，全部通过后才能 commit：

```bash
cd backend  && npx tsc --noEmit
cd backend  && npm run test:coverage
cd frontend && npx tsc --noEmit
npm run test:scripts          # 脚本单测（scripts/**/*.test.mjs）
```

任何一项失败必须先修复，不允许强行提交。

## 4. 提交与汇报

- 中文 Conventional Commits：`<type>(<scope>): <subject>`，不以句号结尾。
- 在 feature 分支提交；完成后说明是否 push、是否合并回 `main`。

## 项目结构

- `frontend/` React + Vite + Tailwind（H5，手机 / 平板；大屏按根字号等比放大）
- `backend/` Node + Express + TypeScript + SQLite（测试为 Vitest 集成测试）
- `scripts/` 数据生成脚本；`scripts/fetch-voice-package.mjs` 生成教材语音包
- 语音包：`frontend/src/data/voice-packages/*.json`。前端按单词归一化查表——优先播放真人录音、展示配套插图；未命中时音频回退讯飞 TTS，图片则不显示。
