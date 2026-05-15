#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────
# 哈尔滨车辆轨迹分析系统 统一部署脚本
#
# 用法:
#   ./scripts/deploy.sh --fresh           从 0 开始完整部署
#   ./scripts/deploy.sh --auto            自动判断状态继续
#   ./scripts/deploy.sh --module <name>   强制刷新指定模块
#     <name>: stats | ops | risk | report | governance | all | rebuild | ingest
# ──────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DOCKER_COMPOSE_CMD=""
COMPOSE_ARGS=""
BACKEND_SVC="backend"
POSTGRES_SVC="postgres"
FRONTEND_SVC="frontend"
DB_NAME="harbin_traffic"
DB_USER="postgres"
TIMEOUT=300

_ok()   { printf "\033[32m[OK]\033[0m %s\n" "$1"; }
_step() { printf "\033[34m[..]\033[0m %s\n" "$1"; }
_warn() { printf "\033[33m[!!]\033[0m %s\n" "$1"; }
_die()  { printf "\033[31m[XX]\033[0m %s\n" "$1"; exit 1; }
_info() { printf "     %s\n" "$1"; }

# ── detect docker compose ──
_detect_compose() {
    if docker compose version &>/dev/null; then
        DOCKER_COMPOSE_CMD="docker compose"
    elif docker-compose version &>/dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
    else
        _die "请先安装 Docker Compose"
    fi
}

# ── check docker daemon ──
_check_docker() {
    if ! docker info &>/dev/null; then
        _die "Docker daemon 未运行，请先启动 Docker Desktop"
    fi
    _ok "Docker 已就绪"
}

# ── service helpers ──
_svc_running() {
    local svc="$1"
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS ps "$svc" 2>/dev/null | grep -q 'Up' && return 0 || return 1
}

_psql() {
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS exec -T "$POSTGRES_SVC" \
        psql -U "$DB_USER" -d "$DB_NAME" "$@" 2>/dev/null
}

_db_has_data() {
    local cnt
    cnt=$(_psql -tAc "SELECT COUNT(*) FROM trips LIMIT 1" 2>/dev/null || echo "0")
    cnt=$(echo "$cnt" | tr -d '[:space:]')
    [ "${cnt:-0}" -gt 0 ] && return 0 || return 1
}

# ── start / stop services ──
_start_postgres() {
    if _svc_running "$POSTGRES_SVC"; then
        _ok "PostgreSQL 已在运行"
        return
    fi
    _step "启动 PostgreSQL …"
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS up -d --wait "$POSTGRES_SVC" 2>&1 | grep -v "^$" || true
    _ok "PostgreSQL 已就绪"
}

_start_backend() {
    if _svc_running "$BACKEND_SVC"; then
        _ok "Backend 已在运行"
        return
    fi
    _step "启动 Backend …"
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS up -d --wait "$BACKEND_SVC" 2>&1 | grep -v "^$" || true
    _ok "Backend 已就绪"
}

_start_frontend() {
    if _svc_running "$FRONTEND_SVC"; then
        _ok "Frontend 已在运行"
        return
    fi
    _step "启动 Frontend …"
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS up -d --wait "$FRONTEND_SVC" 2>&1 | grep -v "^$" || true
    _ok "Frontend 已就绪"
}

_check_data_files() {
    local h5_count jld_count
    h5_count=$(find "$PROJECT_DIR/data" -name "*.h5" 2>/dev/null | wc -l | tr -d '[:space:]')
    jld_count=$(find "$PROJECT_DIR/jldpath" -name "*.jld2" 2>/dev/null | wc -l | tr -d '[:space:]')
    _info "H5 文件: ${h5_count:-0} 个"
    _info "JLD2 文件: ${jld_count:-0} 个"
    if [ "${h5_count:-0}" -lt 1 ] || [ "${jld_count:-0}" -lt 1 ]; then
        _die "原始数据不完整，请先执行: ./scripts/prepare_data.sh"
    fi
    _ok "原始数据就绪"
}

# ── run pipeline ──
_run_pipeline() {
    local mode="$1"
    local extra_args="${EXTRA_PIPELINE_ARGS:-}"

    _step "执行管线: mode=$mode extra=$extra_args"
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS exec -T "$BACKEND_SVC" \
        bash -lc "PYTHONUNBUFFERED=1 PYTHONPATH=/app uv run python -m app.etl.load_data --base-dir / --mode $mode $extra_args" 2>&1
    _ok "管线完成: $mode"
}

_refresh_module() {
    local module="$1"
    case "$module" in
        stats)       _run_pipeline "refresh-stats" ;;
        ops)         _run_pipeline "refresh-ops" ;;
        risk)        _run_pipeline "refresh-risk" ;;
        report)      _run_pipeline "refresh-report" ;;
        governance)  _run_pipeline "refresh-governance" ;;
        all)         _run_pipeline "refresh-all" ;;
        rebuild)     _run_pipeline "rebuild" ;;
        ingest)      _run_pipeline "ingest" ;;
        *)           _die "未知模块: $module。支持: stats | ops | risk | report | governance | all | rebuild | ingest" ;;
    esac
}

# ── show summary ──
_show_summary() {
    echo ""
    echo "  ┌───────────────────────────────────────────┐"
    echo "  │  前端:  http://localhost:5173             │"
    echo "  │  后端:  http://localhost:8000             │"
    echo "  │  API文档: http://localhost:8000/docs       │"
    echo "  └───────────────────────────────────────────┘"
    echo ""
}

# ══════════════════════════════════════════════════════════
# mode: fresh — 从 0 开始完整部署
# ══════════════════════════════════════════════════════════
_fresh() {
    echo ""
    echo "  ╔══════════════════════════════════════════╗"
    echo "  ║       从 0 开始完整部署 (fresh)         ║"
    echo "  ╚══════════════════════════════════════════╝"
    echo ""

    echo "  [1/5] 环境检查"
    echo "  ──────────────"
    _check_docker
    _check_data_files

    echo ""
    echo "  [2/5] 启动 PostgreSQL"
    echo "  ─────────────────────"
    _start_postgres

    # 检查存量数据并提示清空
    if _db_has_data; then
        local cnt
        cnt=$(_psql -tAc "SELECT COUNT(*) FROM trips")
        cnt=$(echo "$cnt" | tr -d '[:space:]')
        echo ""
        _warn "数据库已有 ${cnt} 条行程数据，即将清空并重建"
    fi

    echo ""
    echo "  [3/5] 全量入仓 + 计算"
    echo "  ─────────────────────"
    echo "  (此步骤耗时较长，5 个 H5 文件共约 5GB)"
    _start_backend
    _run_pipeline "rebuild"

    echo ""
    echo "  [4/5] 启动服务"
    echo "  ─────────────"
    _start_frontend

    echo ""
    echo "  [5/5] 大功告成"
    echo "  ─────────────"
    _ok "完整部署完成"
    _show_summary
}

# ══════════════════════════════════════════════════════════
# mode: auto — 自动判断当前状态继续
# ══════════════════════════════════════════════════════════
_auto() {
    echo ""
    echo "  ╔══════════════════════════════════════════╗"
    echo "  ║     自动判断当前状态继续 (auto)         ║"
    echo "  ╚══════════════════════════════════════════╝"
    echo ""

    _check_docker

    # 1. 确保 PostgreSQL 在线
    _start_postgres

    # 2. 根据数据状态决定动作
    if _db_has_data; then
        local cnt
        cnt=$(_psql -tAc "SELECT COUNT(*) FROM trips")
        cnt=$(echo "$cnt" | tr -d '[:space:]')
        _ok "检测到 ${cnt} 条行程数据"

        local stats_cnt
        stats_cnt=$(_psql -tAc "SELECT COUNT(*) FROM daily_metrics" 2>/dev/null || echo "0")
        stats_cnt=$(echo "$stats_cnt" | tr -d '[:space:]')
        if [ "${stats_cnt:-0}" -gt 0 ]; then
            _ok "统计表已有数据，增量刷新 …"
            _start_backend
            _run_pipeline "refresh"
        else
            _warn "统计表为空，全量计算 …"
            _start_backend
            _run_pipeline "compute"
        fi
    else
        _warn "数据库为空，开始完整重建 …"
        _check_data_files
        _info "全量入仓中（约 5GB 数据，耗时较长）"
        _start_backend
        _run_pipeline "rebuild"
    fi

    _start_frontend
    _ok "自动部署完成"
    _show_summary
}

# ══════════════════════════════════════════════════════════
# mode: module — 强制刷新指定模块
# ══════════════════════════════════════════════════════════
_module_mode() {
    local name="$1"
    echo ""
    echo "  ╔══════════════════════════════════════════╗"
    printf "  ║      强制刷新指定模块: %-18s ║\n" "$name"
    echo "  ╚══════════════════════════════════════════╝"
    echo ""

    _check_docker
    _start_postgres

    if [ "$name" = "rebuild" ]; then
        _check_data_files
        local cnt
        cnt=$(_psql -tAc "SELECT COUNT(*) FROM trips" 2>/dev/null || echo "0")
        cnt=$(echo "$cnt" | tr -d '[:space:]')
        if [ "${cnt:-0}" -gt 0 ]; then
            _warn "库中已有 ${cnt} 条行程，重建将清空后重新入仓"
            _info "(trips, trip_segments, trip_points_raw 等明细表将被 TRUNCATE)"
        fi
    fi

    _start_backend
    _refresh_module "$name"

    if [ "$name" = "rebuild" ] || [ "$name" = "all" ]; then
        _start_frontend
    fi
    _ok "模块刷新完成: $name"
    _show_summary
}

# ── usage ──
_usage() {
    cat <<'EOF'
用法:
  ./scripts/deploy.sh --fresh           从 0 开始完整部署
  ./scripts/deploy.sh --auto            自动判断当前状态继续
  ./scripts/deploy.sh --module <name>   强制刷新指定模块

模块:
  stats       - 统计聚合        ops         - 运营画像
  risk        - 风险监测        report      - 运营报表
  governance  - 数据治理        all         - 全部模块（按依赖）
  rebuild     - 完整重建（清库重来）
  ingest      - 仅数据入仓

部署流程 (--fresh):
  ① 环境检查（Docker + H5/JLD2 数据文件）
  ② 启动 PostgreSQL + 确保 Schema 最新
  ③ 全量入仓 + 计算（ingest → stats → ops → risk → report → governance）
  ④ 启动 Backend + Frontend

全新上手:
  git clone <repo> && cd data_platform
  ./scripts/prepare_data.sh        # 下载原始数据
  ./scripts/deploy.sh --fresh      # 一键部署
EOF
}

# ── main ──
main() {
    _detect_compose

    case "${1:-}" in
        --fresh)    shift; _fresh "$@" ;;
        --auto)     shift; _auto "$@" ;;
        --module)   shift; _module_mode "${1:-}" ;;
        --help|-h)  _usage ;;
        *)          _usage; exit 1 ;;
    esac
}

main "$@"
