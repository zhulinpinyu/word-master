#!/bin/bash
#
# word-master 一键部署到群晖（在 Mac 上执行）
#
#   ./deploy-nas.sh              # 版本号 = 当前 git 短 SHA
#   ./deploy-nas.sh 1.1.3        # 指定版本号
#
# 一条命令完成：
#   构建 linux/amd64 → 校验架构 → 经 SSH 管道直传 → NAS 上加载 → 重建容器 → 验证
#
# 相比手工流程省掉的：
#   - 不需要 docker save 落一个 141MB 临时文件
#   - 不需要 scp（顺带避开 scp 新协议要 -O 的坑）
#   - 不需要登录 NAS 手动 docker load / 跑脚本
#   - 不需要改任何脚本里的 IMAGE_TAG，版本号是命令行参数
#
# 环境变量（都有默认值，按需覆盖）：
#   NAS=nas                          ~/.ssh/config 里的主机别名
#   APP_DIR=/volume1/docker/word-master
#   HOST_PORT=3201                   word-master 对外 HTTP 端口
#   TZ_NAME=Asia/Shanghai
#   KEEP=1                           保留 NAS 上的旧镜像（默认清理）
#
set -euo pipefail

NAS="${NAS:-nas}"
REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
APP_DIR="${APP_DIR:-/volume1/docker/word-master}"
HOST_PORT="${HOST_PORT:-3201}"
TZ_NAME="${TZ_NAME:-Asia/Shanghai}"
HTTPS_PORT="${HTTPS_PORT:-3202}"
CONTAINER="${CONTAINER:-word-master}"
KEEP="${KEEP:-0}"

cd "$REPO"

# ── 版本号 ────────────────────────────────────────────────
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
VERSION="${1:-$SHA}"
IMAGE="word-master:${VERSION}"

echo "=========================================="
echo " word-master → 群晖"
echo "=========================================="
echo "  仓库：    $REPO"
echo "  版本：    $VERSION   (HEAD $SHA)"
echo "  目标：    $NAS:$APP_DIR"
echo "  对外端口：$HOST_PORT"
echo

# ── 0. 探测 NAS 上 docker 怎么调 ──────────────────────────
echo "==> 0/5 探测 NAS 环境"
if ! ssh -o ConnectTimeout=10 "$NAS" true 2>/dev/null; then
  echo "❌ 连不上 $NAS。检查 ~/.ssh/config 里的主机别名与 SSH 端口。"
  exit 1
fi
if ssh "$NAS" 'docker info >/dev/null 2>&1'; then
  DOCKER="docker"
elif ssh "$NAS" 'sudo -n docker info >/dev/null 2>&1'; then
  DOCKER="sudo -n docker"
else
  cat <<'EOF'
❌ NAS 上的 docker 需要 sudo 密码，而管道传输时无法交互输入密码。

   请在 NAS 上执行一次，给 docker 配免密 sudo（只需一次）：

     ssh nas 'echo "$(whoami) ALL=(ALL) NOPASSWD: /usr/local/bin/docker" | sudo tee /etc/sudoers.d/word-master-docker'

   然后重新运行本脚本。
EOF
  exit 1
fi
echo "    docker 调用方式：$DOCKER"
ssh "$NAS" "$DOCKER version --format '{{.Server.Version}}'" | sed 's/^/    NAS docker 版本：/'

# ── 1. 构建 ───────────────────────────────────────────────
echo
echo "==> 1/5 构建 linux/amd64 镜像"
docker buildx build \
  --platform linux/amd64 \
  --load \
  --progress plain \
  --build-arg "VITE_GIT_SHA=$SHA" \
  -t "$IMAGE" \
  -t word-master:latest \
  "$REPO" | tail -3

# ── 2. 校验架构 ───────────────────────────────────────────
echo
echo "==> 2/5 校验架构"
ARCH="$(docker image inspect "$IMAGE" --format '{{.Architecture}}/{{.Os}}')"
if [ "$ARCH" != "amd64/linux" ]; then
  echo "❌ 架构是 $ARCH，群晖 DS218+ 需要 amd64/linux"
  exit 1
fi
SIZE="$(docker image inspect "$IMAGE" --format '{{.Size}}' | awk '{printf "%.0f MB", $1/1024/1024}')"
echo "    ✅ $ARCH  $SIZE"

# ── 3. 直传（管道，不落临时文件）───────────────────────────
echo
echo "==> 3/5 传输到 NAS（管道直传，不落临时文件）"
START=$(date +%s)
docker save "$IMAGE" | gzip -1 | ssh "$NAS" "gunzip | $DOCKER load"
echo "    耗时 $(($(date +%s) - START)) 秒"

# ── 4. 重建容器 ───────────────────────────────────────────
echo
echo "==> 4/5 重建容器 $CONTAINER"
ssh "$NAS" "
  set -e
  $DOCKER rm -f $CONTAINER >/dev/null 2>&1 || true
  $DOCKER run -d \
    --name $CONTAINER \
    --restart unless-stopped \
    -p ${HOST_PORT}:3000 \
    -e TZ=${TZ_NAME} \
    --env-file $APP_DIR/word-master.env \
    -v $APP_DIR/data:/app/data \
    -v $APP_DIR/cache:/app/node_modules/@xenova/transformers/.cache \
    $IMAGE >/dev/null
  echo '    容器已重建'
"

# ── 5. 验证 ───────────────────────────────────────────────
echo
echo "==> 5/5 验证"
printf "    等待服务就绪"
for _ in $(seq 1 20); do
  sleep 3; printf "."
  ssh "$NAS" "curl -fsS http://127.0.0.1:${HOST_PORT}/api/health >/dev/null 2>&1" && break
  ssh "$NAS" "[ \"\$($DOCKER inspect -f '{{.State.Running}}' $CONTAINER 2>/dev/null)\" = true ]" || {
    echo " 容器已退出"; ssh "$NAS" "$DOCKER logs $CONTAINER 2>&1 | tail -15"; exit 1; }
done
echo

echo
echo "    启动日志："
ssh "$NAS" "$DOCKER logs $CONTAINER 2>&1 | tail -4 | sed 's/^/      /'"
echo
echo -n "    /api/health   -> "; ssh "$NAS" "curl -fsS http://127.0.0.1:${HOST_PORT}/api/health" || echo "❌ 无响应"
echo
echo -n "    /api/students -> "; ssh "$NAS" "curl -fsS http://127.0.0.1:${HOST_PORT}/api/students | head -c 100"
echo
echo -n "    today 任务    -> "; ssh "$NAS" "curl -fsS 'http://127.0.0.1:${HOST_PORT}/api/tasks/today?student_id=1&wordbook_id=4' | head -c 80"
echo

# ── 清理旧镜像 ────────────────────────────────────────────
if [ "$KEEP" != "1" ]; then
  echo
  echo "==> 清理 NAS 上的旧 word-master 镜像（保留 $IMAGE 与 latest）"
  ssh "$NAS" "
    for id in \$($DOCKER images --format '{{.ID}} {{.Repository}}:{{.Tag}}' \
                | awk '/^[0-9a-f]+ word-master:/ && \$2 != \"$IMAGE\" && \$2 != \"word-master:latest\" {print \$1}' | sort -u); do
      $DOCKER rmi \$id >/dev/null 2>&1 && echo \"    已删除 \$id\" || true
    done
  "
fi

IP="$(ssh "$NAS" "ip route get 1.1.1.1 2>/dev/null | awk '{print \$NF; exit}'" 2>/dev/null || true)"
[ -n "${IP:-}" ] || IP="<群晖IP>"

echo
echo "=========================================="
echo " ✅ 部署完成  $IMAGE"
echo "    http://${IP}:${HOST_PORT}        （HTTP，麦克风不可用）"
echo "    https://${IP}:${HTTPS_PORT}          （HTTPS，语音输入用这个）"
echo "    数据目录：$APP_DIR/data"
echo "=========================================="
