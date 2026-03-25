# 后端（FastAPI）

## 1. 环境

- Python: `/Users/apple/python_data/bin/python`
- Package manager: `uv`
- Database: local PostgreSQL + PostGIS (`harbin_traffic`)

## 2. 安装依赖

```bash
uv sync
```

## 3. 初始化数据库

```bash
/opt/homebrew/opt/postgresql@18/bin/psql -d harbin_traffic -f ../infra/postgres/bootstrap.sql
```

## 4. 入仓流程

当前入仓逻辑为文件级并行入仓，直接写入 PostgreSQL 明细表：

1. Truncate rebuild tables.
2. Dispatch source files in parallel workers (`data/*.h5`, optional matching `jldpath/*.jld2`).
3. Each worker opens one source file and performs chunked `COPY` writes (default `50_000` rows per chunk).

PostgreSQL/PostGIS 是在线主存储，不需要 CSV/Parquet 中间层。

路由链路固定顺序：`ingest -> 路网入仓模块 -> compute -> stats -> route search`。
其中热力图和 `road_speed_bins` 依赖路网入仓模块完成后再刷新。

### 4.1 运行模式

- `ingest`：只执行入仓编排（只清理明细层，不清理统计表和路径依赖表）。
- `rebuild`：总编排（入仓 + 路网入仓模块 + 统计刷新 + 路径能力准备 + 运行链路校验提示）。
- `optimize`：不入仓，只做数据库优化。
- `compute`：只刷新统计表（要求路网和映射已可用）。
- `smoke`：只验证统计和接口，不扫描大表。

仅计算统计（默认，不重新入仓）：

```bash
.venv/bin/python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode compute
```

重建模式（清表 + 并行分块入仓 + 统计刷新）：

```bash
.venv/bin/python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode rebuild
```

说明：`ingest` 仅清理入仓明细表；`rebuild` 会按固定顺序执行路网和映射，再刷新统计并准备路径搜索依赖。

仅入仓模式（清表 + 并行分块入仓 + 索引重建 + analyze）：

```bash
.venv/bin/python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode ingest
```

小规模试跑：

```bash
.venv/bin/python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode rebuild --max-trips 20
```

自定义 chunk / worker：

```bash
.venv/bin/python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode rebuild --chunk-size 50000 --workers 4
```

trip upsert 批大小调整：

```bash
.venv/bin/python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode ingest --chunk-size 200000 --workers 5 --trip-upsert-batch-size 200
```

完整重建：

```bash
.venv/bin/python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode rebuild
```

## 5. 回归策略

- 默认回归（`make test`、CI）不能执行入仓。
- 入仓相关检查单独作为运维任务或手工检查。

## 6. 冒烟检查

- Quick smoke run (compute semantics, no ingest):

```bash
make smoke
```

## 7. 启动 API

```bash
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 8. 主要接口

- `GET /healthz`
- `GET /api/v1/summary/daily`
- `GET /api/v1/map/heatmap?metric_date=2015-01-03`
- `GET /api/v1/map/heatmap/buckets?metric_date=2015-01-03`
- `GET /api/v1/chart/daily-trip-count`
- `GET /api/v1/chart/daily-vehicle-count`
- `GET /api/v1/chart/daily-distance`
- `GET /api/v1/chart/daily-distance-boxplot`
- `GET /api/v1/chart/daily-speed-boxplot`
- `POST /api/v1/route/compare`

`/api/v1/route/compare` 请求体需同时提供 `start_time` 与 `query_time`，前者表示行程起始时刻，后者用于命中 `road_speed_bins` 的 5 分钟速度桶。

## 9. 回归测试

- Run all backend tests:

```bash
uv sync --group dev
uv run pytest -q
```

## 10. 文档入口

- 主设计总纲：`../spec.md`
- 实施版总纲：`../implementation_guide.md`
- 运行上下文：`../project_context.md`
- pgRouting 环境与专项测试：`../docs/pgrouting_environment.md`
