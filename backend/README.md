# 后端说明（FastAPI）

## 1. 环境

- Python：建议 3.11+
- 包管理：`uv`
- 数据库：PostgreSQL + PostGIS + pgRouting

## 2. 安装依赖

```bash
uv sync
```

## 3. 初始化数据库

```bash
psql "postgresql://postgres:postgres@localhost:5432/harbin_traffic" -f ../infra/postgres/bootstrap.sql
```

## 4. 启动 API

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 5. 入仓流程

入仓链路为文件级并行写入 PostgreSQL：

1. 清理重建目标表（按模式执行）
2. 并行分发源文件（`data/*.h5`，可选匹配 `jldpath/*.jld2`）
3. 每个 worker 以分块 `COPY` 写入（默认每块 200_000 行）

固定顺序：`ingest -> 路网入仓模块 -> stats -> ops -> risk -> report -> governance`。

## 6. 常用运行模式

| 模式 | 说明 |
|------|------|
| `ingest` | 仅入仓编排，清理并重建明细层 |
| `rebuild` | 入仓 → 路网 → stats → ops → risk → report → governance（全量重建） |
| `refresh` | 复用已有明细，刷新路网映射 + 全部模块聚合（日常推荐） |
| `compute` | 不入仓，仅刷新全部模块聚合（stats → ops → risk → report → governance） |
| `optimize` | 仅索引维护 + ANALYZE |
| `smoke` | 仅做轻量统计表验证 |
| `refresh-stats` / `refresh-ops` / `refresh-risk` / `refresh-report` / `refresh-governance` | 独立模块刷新 |
| `refresh-all` | 按依赖顺序执行全部模块刷新 |

示例：

```bash
uv run python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode rebuild

# 日常推荐（不中断大入仓时）
uv run python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode refresh
```

说明：

- 全量 `rebuild` 对数据量较大时耗时很长（特别是 `trip_segments` 距离/速度重算）。
- 若历史存在异常中断导致 `ingest_runs` 里残留 `running` 记录，新任务启动会自动标记为 stale failed。

## 7. 主要接口

### 总览与图表
- `GET /healthz`
- `GET /api/v1/summary/daily`
- `GET /api/v1/chart/daily-trip-count`
- `GET /api/v1/chart/daily-vehicle-count`
- `GET /api/v1/chart/daily-distance`
- `GET /api/v1/chart/daily-distance-boxplot`
- `GET /api/v1/chart/daily-speed-boxplot`

### 热力图与地图
- `GET /api/v1/map/heatmap`
- `GET /api/v1/map/heatmap/buckets`
- `GET /api/v1/map/vehicle-path`

### 路径对比
- `POST /api/v1/route/compare`
- `GET /api/v1/route/capability`

### 运营画像
- `GET /api/v1/ops/vehicle-profiles`
- `GET /api/v1/ops/frequent-routes`
- `GET /api/v1/ops/activity-ranking`

### 风险监测
- `GET /api/v1/risk/fatigue`
- `GET /api/v1/risk/abnormal`
- `GET /api/v1/risk/summary`

### 运营报表
- `GET /api/v1/report/daily`
- `GET /api/v1/report/weekly`

### 数据治理
- `GET /api/v1/governance/assets`
- `GET /api/v1/governance/quality`

## 8. 测试

```bash
uv sync --group dev
uv run pytest -q
```

## 9. 文档入口

- `../spec.md`
- `../implementation_guide.md`
- `../project_context.md`
- `../docs/pgrouting_environment.md`
