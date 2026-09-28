#!/bin/bash
#
# word-master 一键部署到群晖（在 Mac 上执行）
#
#   ./deploy-nas.sh              # 版本号 = 当前 git 短 SHA
#   ./deploy-nas.sh 1.1.3        # 指定版本号
#
# 一条命令完成：
#   构建 linux/amd64 → 校验架构 → 传到 NAS → 一次 sudo 会话内加载并重建容器 → 验证
#
# 关于 sudo：
#   NAS 上 docker 需要 sudo（Synology 默认如此）。管道传输时无法交互输密码，
#   所以先把镜像包传到 NAS 上一个普通目录（不需要 sudo），
#   再用一次 `ssh -t` 开一个 TTY，在同一个 sudo 会话里完成所有需要 root 的操作
#   —— 全程只输一次密码，且不需要改动 NAS 上的 sudo 配置。
#
# 环境变量（都有默认值，按需覆盖）：
#   NAS=nas                          ~/.ssh/config 里的主机别名
#   APP_DIR=/volume1/docker/word-master
#   HOST_PORT=3201                   word-master 对外 HTTP 端口
#   TZ_NAME=Asia/Shanghai
#   HTTPS_PORT=3202                  HTTPS 入口端口（仅用于最后提示）
#   KEEP=1                           保留 NAS 上的旧镜像（默认清理）
#   REMOTE_TMP=<自动探测>              NAS 上存放临时镜像包的位置（需 >600MB 空闲）
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
REMOTE_TMP="${REMOTE_TMP:-}"

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

# ── 0. 连通性 + 找临时目录 ────────────────────────────────
echo "==> 0/5 探测 NAS"
ssh -o ConnectTimeout=10 -o BatchMode=yes "$NAS" true 2>/dev/null \
  || { echo "❌ 连不上 ${NAS}（检查 ~/.ssh/config 的别名与端口，或是否配了免密登录）"; exit 1; }

if [ -z "$REMOTE_TMP" ]; then
  REMOTE_TMP="$(ssh "$NAS" '
    for d in "$HOME" /volume1/word-master-nas-deploy /volume1/docker /tmp; do
      [ -n "$d" ] && [ -d "$d" ] && [ -w "$d" ] || continue
      avail=$(df -Pm "$d" 2>/dev/null | awk "NR==2{print \$4}")
      [ -n "$avail" ] && [ "$avail" -gt 600 ] && { echo "$d"; exit 0; }
    done
  ' 2>/dev/null || true)"
fi

if [ -z "$REMOTE_TMP" ]; then
  cat <<'EOF'
❌ 在 NAS 上找不到「当前用户可写、且空闲空间 > 600MB」的目录来暂存镜像包。

   用下面这条看看 NAS 上有哪些可写且有空间的目录，然后用 REMOTE_TMP= 指定：

     ssh nas 'df -Pm /volume1 | tail -1; ls -ld $HOME /volume1/*'

   例如： REMOTE_TMP=/volume1/homes/admin ./scripts/deploy-nas.sh
EOF
  exit 1
fi
echo "    临时目录：$REMOTE_TMP"

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
  echo "❌ 架构是 ${ARCH}，群晖 DS218+ 需要 amd64/linux"
  exit 1
fi
SIZE="$(docker image inspect "$IMAGE" --format '{{.Size}}' | awk '{printf "%.0f MB", $1/1024/1024}')"
echo "    ✅ $ARCH  $SIZE"

# ── 3. 传到 NAS（普通目录，不需要 sudo）────────────────────
REMOTE_IMG="$REMOTE_TMP/word-master-image.tar.gz"
echo
echo "==> 3/5 传输到 $REMOTE_IMG"
START=$(date +%s)
docker save "$IMAGE" | gzip -1 | ssh "$NAS" "cat > '$REMOTE_IMG'"
BYTES="$(ssh "$NAS" "wc -c < '$REMOTE_IMG'" | tr -d ' ')"
echo "    $(( BYTES / 1024 / 1024 )) MB，耗时 $(($(date +%s) - START)) 秒"

# ── 4. 生成并执行远端脚本（一次 sudo 会话）───────────────
LOCAL_APPLY="$(mktemp -t wm-apply)"
trap 'rm -f "$LOCAL_APPLY"' EXIT

CLEANUP_BLOCK=""
if [ "$KEEP" != "1" ]; then
  CLEANUP_BLOCK="
echo
echo '    清理 NAS 上的旧 word-master 镜像（保留 $IMAGE 与 latest）'
for id in \$(docker images --format '{{.ID}} {{.Repository}}:{{.Tag}}' \\
            | awk '/^[0-9a-f]+ word-master:/ && \$2 != \"$IMAGE\" && \$2 != \"word-master:latest\" {print \$1}' | sort -u); do
  docker rmi \$id >/dev/null 2>&1 && echo \"      已删除 \$id\" || true
done"
fi

cat > "$LOCAL_APPLY" <<REMOTE
#!/bin/bash
# 由 deploy-nas.sh 生成，在 NAS 上以 root 执行
set -uo pipefail
export PATH="\$PATH:/usr/local/bin:/usr/local/sbin"

echo "    载入镜像…"
docker load -i '$REMOTE_IMG' || exit 1
rm -f '$REMOTE_IMG'

echo "    重建容器 ${CONTAINER}…"
docker rm -f '$CONTAINER' >/dev/null 2>&1 || true
docker run -d \\
  --name '$CONTAINER' \\
  --restart unless-stopped \\
  -p ${HOST_PORT}:3000 \\
  -e TZ='$TZ_NAME' \\
  --env-file '$APP_DIR/word-master.env' \\
  -v '$APP_DIR/data:/app/data' \\
  -v '$APP_DIR/cache:/app/node_modules/@xenova/transformers/.cache' \\
  '$IMAGE' >/dev/null || exit 1

printf '    等待服务就绪'
ok=0
for i in \$(seq 1 20); do
  sleep 3; printf '.'
  curl -fsS 'http://127.0.0.1:${HOST_PORT}/api/health' >/dev/null 2>&1 && { ok=1; break; }
  if [ "\$(docker inspect -f '{{.State.Running}}' '$CONTAINER' 2>/dev/null)" != "true" ]; then
    echo
    echo "    ❌ 容器已退出，日志："
    docker logs '$CONTAINER' 2>&1 | tail -15 | sed 's/^/      /'
    exit 1
  fi
done
echo
[ "\$ok" = "1" ] || { echo "    ❌ 健康检查超时"; docker logs '$CONTAINER' 2>&1 | tail -15; exit 1; }

echo
echo "    启动日志："
docker logs '$CONTAINER' 2>&1 | tail -4 | sed 's/^/      /'
echo
echo -n "    /api/health   -> "; curl -fsS 'http://127.0.0.1:${HOST_PORT}/api/health' || echo '无响应'
echo
echo -n "    /api/students -> "; curl -fsS 'http://127.0.0.1:${HOST_PORT}/api/students' | head -c 100 || echo '无响应'
echo
echo -n "    today 任务    -> "; curl -fsS 'http://127.0.0.1:${HOST_PORT}/api/tasks/today?student_id=1&wordbook_id=4' | head -c 80 || echo '无响应'
echo
${CLEANUP_BLOCK}
REMOTE

echo
echo "==> 4/5 在 NAS 上加载并重建（接下来会提示输入 sudo 密码，只需一次）"
ssh "$NAS" "cat > '$REMOTE_TMP/wm-apply.sh'" < "$LOCAL_APPLY"
ssh -t "$NAS" "sudo bash '$REMOTE_TMP/wm-apply.sh'; rm -f '$REMOTE_TMP/wm-apply.sh'"

IP="$(ssh "$NAS" "ip route get 1.1.1.1 2>/dev/null | awk '{print \$NF; exit}'" 2>/dev/null || true)"
[ -n "${IP:-}" ] || IP="<群晖IP>"

echo
echo "=========================================="
echo " ✅ 部署完成  $IMAGE"
echo "    http://${IP}:${HOST_PORT}        （HTTP，麦克风不可用）"
echo "    https://${IP}:${HTTPS_PORT}        （HTTPS，语音输入用这个）"
echo "    数据目录：$APP_DIR/data"
[ "$KEEP" != "1" ] && echo "    （已清理旧镜像；想保留回滚能力用 KEEP=1 重跑）"
echo "=========================================="
