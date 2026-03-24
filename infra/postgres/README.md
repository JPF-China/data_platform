# 本地 PostgreSQL + PostGIS

1. 使用 Homebrew 安装 PostgreSQL 和 PostGIS。
2. 启动 PostgreSQL 服务。
3. 创建数据库 `harbin_traffic`。
4. 执行 `bootstrap.sql` 初始化扩展和分层表结构。

## SQL 文件分层

- `init.sql`：基础扩展 + 路网/路径核心表（不含入仓与统计明细）
- `ingest_schema.sql`：入仓链路表与索引
- `stats_schema.sql`：统计链路表与索引
- `bootstrap.sql`：统一入口，按顺序加载以上三个脚本

## 生产/存量库迁移（时区无关 datetime）

- 如果库里历史字段是 `timestamptz`，执行 `migrate_timezone_agnostic.sql` 完成安全迁移。
- 该脚本会把业务时间列从 `timestamptz` 转成 `timestamp`，并按业务时区重写为钟面时间。
- 默认业务时区是 `Asia/Shanghai`；可先执行 `SET app.business_timezone = 'Asia/Shanghai';` 覆盖。
- 这是存量库兜底脚本，不属于正常新库初始化流程。
- 示例：
  - `psql "dbname=harbin_traffic user=apple host=localhost port=5432" -f infra/postgres/migrate_timezone_agnostic.sql`

## 入仓定位

- PostgreSQL/PostGIS 是仓库，也是在线服务主存储。
- `H5/JLD2` 由文件级并行 worker 直接入仓。
- 每个 worker 使用 chunked `COPY`（默认 50k 行），不逐行写入。

## 路网与映射定位

- `road_segments` 由 `bfmap_ways.csv` 构建，作为 pgRouting 主图。
- `bfmap_ways_import` 是 BfMap 导出 CSV 原始导入表。
- 历史 OSM 中间表（如 `osm_road_edges`）已废弃，不再作为运行链路的一部分。
- 建议维护 `ingest_road_map`，承接入仓 `road_id` 与 BfMap 边映射。
- 热力图与道路速度桶依赖映射，刷新顺序必须在路网和映射之后。

## 文档入口

- 主设计总纲：`../../spec.md`
- 实施版总纲：`../../implementation_guide.md`
- 运行上下文：`../../project_context.md`
- pgRouting 环境与专项测试：`../../docs/pgrouting_environment.md`
