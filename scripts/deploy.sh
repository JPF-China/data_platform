#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────
# 哈尔滨车辆轨迹分析系统 统一部署脚本
#
# 用法:
#   ./scripts/deploy.sh --fresh           从0开始完整部署
#   ./scripts/deploy.sh --auto            自动判断当前状态继续
#   ./scripts/deploy.sh --module <name>   强制刷新指定模块
#     <name>: stats | ops | risk | report | governance | all | ingest | rebuild
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

_ok()  { printf "\033[32m[OK]\033[0m %s\n" "$1"; }
_step() { printf "\033[34m[..]\033[0m %s\n" "$1"; }
_warn(){ printf "\033[33m[!!]\033[0m %s\n" "$1"; }
_die() { printf "\033[31m[XX]\033[0m %s\n" "$1"; exit 1; }

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
        _die "Docker daemon 未运行"
    fi
    _ok "Docker 已就绪"
}

# ── service status helpers ──
_svc_running() {
    local svc="$1"
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS ps "$svc" 2>/dev/null | grep -q 'Up' && return 0 || return 1
}

_psql() {
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS exec -T "$POSTGRES_SVC" \
        psql -U "$DB_USER" -d "$DB_NAME" "$@" 2>/dev/null
}

# ── DB health ──
_db_has_data() {
    local cnt
    cnt=$(_psql -tAc "SELECT COUNT(*) FROM trips LIMIT 1" 2>/dev/null || echo "0")
    cnt=$(echo "$cnt" | tr -d '[:space:]')
    [ "${cnt:-0}" -gt 0 ] && return 0 || return 1
}

_db_has_stats() {
    local cnt
    cnt=$(_psql -tAc "SELECT COUNT(*) FROM daily_metrics LIMIT 1" 2>/dev/null || echo "0")
    cnt=$(echo "$cnt" | tr -d '[:space:]')
    [ "${cnt:-0}" -gt 0 ] && return 0 || return 1
}

# ── start services ──
_start_services() {
    _step "启动全部服务 (postgres + backend + frontend) …"
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS up -d --wait "$POSTGRES_SVC" "$BACKEND_SVC" "$FRONTEND_SVC" 2>&1 || true

    local waited=0
    while ! _svc_running "$BACKEND_SVC"; do
        sleep 2
        waited=$((waited + 2))
        if [ "$waited" -gt "$TIMEOUT" ]; then
            _die "服务启动超时 (${TIMEOUT}s)"
        fi
    done
    _ok "服务已启动"
}

# ── apply schema ──
_apply_schema() {
    _step "应用数据库 schema …"
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS exec -T "$POSTGRES_SVC" \
        psql -U "$DB_USER" -d "$DB_NAME" -f /docker-entrypoint-initdb.d/01-init.sql 2>&1 | tail -1
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS exec -T "$POSTGRES_SVC" \
        psql -U "$DB_USER" -d "$DB_NAME" -f /docker-entrypoint-initdb.d/02-ingest.sql 2>&1 | tail -1
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS exec -T "$POSTGRES_SVC" \
        psql -U "$DB_USER" -d "$DB_NAME" -f /docker-entrypoint-initdb.d/03-stats.sql 2>&1 | tail -1
    _ok "Schema 已应用"
}

# ── run pipeline ──
_run_pipeline() {
    local mode="$1"
    _step "执行管线: mode=$mode"
    $DOCKER_COMPOSE_CMD $COMPOSE_ARGS exec -T "$BACKEND_SVC" \
        bash -lc "PYTHONPATH=/app uv run python -m app.etl.load_data --base-dir / --mode $mode" 2>&1
    _ok "管线完成: $mode"
}

# ── refresh module (via load_data.py with pipeline tracking) ──
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

# ─── mode: fresh ────────────────────────────────────────
_fresh() {
    echo ""
    echo "  ╔══════════════════════════════════════════╗"
    echo "  ║       从 0 开始完整部署 (fresh)         ║"
    echo "  ╚══════════════════════════════════════════╝"
    echo ""

    _check_docker
    _start_services
    _apply_schema

    _step "检查原始数据 …"
    local h5_count
    h5_count=$(find "$PROJECT_DIR/data" -name "*.h5" 2>/dev/null | wc -l | tr -d '[:space:]')
    local jld_count
    jld_count=$(find "$PROJECT_DIR/jldpath" -name "*.jld2" 2>/dev/null | wc -l | tr -d '[:space:]')
    if [ "${h5_count:-0}" -lt 1 ] || [ "${jld_count:-0}" -lt 1 ]; then
        _warn "原始数据不完整 (h5=$h5_count, jld2=$jld_count)，请先执行: ./scripts/prepare_data.sh"
        _die "缺少原始数据文件"
    fi
    _ok "原始数据就绪 (h5=$h5_count, jld2=$jld_count)"

    _run_pipeline "rebuild"
    _ok "完整部署完成"
    _show_summary
}

# ─── mode: auto ─────────────────────────────────────────
_auto() {
    echo ""
    echo "  ╔══════════════════════════════════════════╗"
    echo "  ║     自动判断当前状态继续 (auto)         ║"
    echo "  ╚══════════════════════════════════════════╝"
    echo ""

    _check_docker

    if ! _svc_running "$POSTGRES_SVC"; then
        _warn "PostgreSQL 未运行，启动全部服务 …"
        _start_services
        _apply_schema
    elif ! _svc_running "$BACKEND_SVC"; then
        _warn "Backend 未运行，启动 …"
        _start_services
    else
        _ok "服务已在线"
    fi

    if _db_has_data; then
        _ok "检测到已有入仓明细数据"
        if _db_has_stats; then
            _ok "统计表已有数据，执行全模块刷新 (refresh)"
            _run_pipeline "refresh"
        else
            _warn "统计表为空，执行全模块计算 (compute)"
            _run_pipeline "compute"
        fi
    else
        _warn "无明细数据，执行完整重建 (rebuild)"
        local h5_count
        h5_count=$(find "$PROJECT_DIR/data" -name "*.h5" 2>/dev/null | wc -l | tr -d '[:space:]')
        if [ "${h5_count:-0}" -lt 1 ]; then
            _die "缺少原始数据，请先执行数据准备"
        fi
        _run_pipeline "rebuild"
    fi

    _ok "自动部署完成"
    _show_summary
}

# ─── mode: module ───────────────────────────────────────
_module_mode() {
    local name="$1"
    echo ""
    echo "  ╔══════════════════════════════════════════╗"
    echo "  ║      强制刷新指定模块: $name              ║"
    echo "  ╚══════════════════════════════════════════╝"
    echo ""

    _check_docker

    if ! _svc_running "$BACKEND_SVC"; then
        _start_services
    else
        _ok "服务已在线"
    fi

    _refresh_module "$name"
    _ok "模块刷新完成: $name"
}

# ─── summary ────────────────────────────────────────────
_show_summary() {
    echo ""
    echo "  ┌───────────────────────────────────────────┐"
    echo "  │  前端:  http://localhost:5173             │"
    echo "  │  后端:  http://localhost:8000             │"
    echo "  │  API文档: http://localhost:8000/docs       │"
    echo "  └───────────────────────────────────────────┘"
    echo ""
}

# ─── usage ──────────────────────────────────────────────
_usage() {
    cat <<'EOF'
用法:
  ./scripts/deploy.sh --fresh           从0开始完整部署
  ./scripts/deploy.sh --auto            自动判断当前状态继续
  ./scripts/deploy.sh --module <name>   强制刷新指定模块

模块:
  stats       - 统计聚合
  ops         - 运营画像
  risk        - 风险监测
  report      - 运营报表
  governance  - 数据治理
  all         - 全部模块（按依赖顺序）
  rebuild     - 完整重建（清库重来）
  ingest      - 仅数据入仓
EOF
}

# ─── main ───────────────────────────────────────────────
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
