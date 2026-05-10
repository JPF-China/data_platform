# 实施版总纲

本文面向直接开发与重构，重点回答四件事：表怎么设计、模块怎么拆、流程怎么跑、谁依赖谁。

## 1. 设计目标

- 大表按日期分区，降低查询和维护成本。
- 所有展示型统计全部离线预计算。
- 路径搜索独立化，优先落到数据库。
- 模块之间只通过表、API 或稳定输入输出连接。
- 每个模块独立可刷新，可被调度器按需单独触发。

## 2. 模块地图

| 模块 | 输入 | 输出 | 禁止事项 |
|---|---|---|---|
| 数据入仓 | H5/JLD2 | 明细表、入仓日志 | 不做统计、不做路径搜索 |
| 路网入仓模块 | `bfmap_ways.csv`、入仓明细 | `bfmap_ways_import`、`road_segments`、`ingest_road_map` | 不做图搜索、不做统计 |
| 数据库优化 | 明细表 | 分区/索引/分析结果 | 不读原始文件、不刷新统计、不改路网 |
| 统计聚合 | 明细表、统计配置 | 统计表（含扩展统计） | 不扫描前端请求、不做路径计算 |
| 路径分析 | 起点/终点/时间、路网图数据 | 最短路/最快路结果、路线策略元数据 | 不扫业务明细表 |
| 运营画像 | 明细表、统计表 | 车辆/司机画像、标签、频繁路线、活跃排行 | 不直接读文件、不改明细表 |
| 风险监测 | 明细表 | 疲劳驾驶、异常运行、夜间风险、风险摘要 | 不依赖前端数据 |
| 运营报表 | 统计表、画像表、风险表 | 日报、周报 | 不重算原始指标 |
| 数据治理 | 全部表（系统目录） | 资产目录、时间范围、任务状态、质量检查、门户摘要 | 不修改业务数据 |
| API 层 | 请求参数、统计/画像/风险/报表表、路径结果 | JSON | 不做重计算 |
| 前端层 | API | 页面 | 不直连数据库 |

## 3. 数据库表设计

### 3.1 明细表

| 表名 | 作用 | 主键/唯一约束 | 分区键 | 关键字段 |
|---|---|---|---|---|
| `trips` | trip 基础信息 | `trip_uid` 唯一 | `trip_date` | `trip_id`、`source_trip_key`、`devid`、`trip_date`、`start_time`、`end_time`、`point_count`、`is_valid`、`source_file` |
| `trip_points_raw` | 原始轨迹点 | `(trip_id, point_seq)` 唯一 | `trip_date` | `trip_id`、`point_seq`、`event_time`、`tms`、`devid`、`lat`、`lon`、`speed`、`geom`、`is_valid` |
| `trip_match_meta` | 匹配元信息 | 无唯一约束 | `trip_date` | `trip_id`、`point_seq`、`matched_seq`、`road_id`、`road_name`、`direction`、`is_virtual`、`confidence` |
| `trip_points_matched` | 匹配后轨迹点 | `(trip_id, point_seq)` 唯一 | `trip_date` | `trip_id`、`point_seq`、`event_time`、`tms`、`lat`、`lon`、`geom`、`road_id`、`road_name` |
| `trip_segments` | 分段结果 | `(trip_id, segment_seq)` 唯一 | `trip_date` | `trip_id`、`segment_seq`、`start_time`、`end_time`、`distance_m`、`duration_s`、`avg_speed_kmh`、`road_id`、`road_name`、`path_geom` |

### 3.2 统计表

| 表名 | 作用 | 主键 |
|---|---|---|
| `daily_metrics` | 日总览指标 | `metric_date` |
| `daily_distance_boxplot` | 日里程箱形图 | `metric_date` |
| `daily_speed_boxplot` | 日速度箱形图 | `metric_date` |
| `heatmap_bins` | 热力图时间窗 | `id` (bigserial) |
| `road_speed_bins` | 道路速度桶 | `(road_id, bucket_start)` |
| `table_row_stats` | 表行数统计 | `table_name` |
| `hourly_metrics` | 小时粒度聚合指标 | `(metric_date, hour_bucket)` |
| `road_daily_stats` | 道路每日统计 | `(metric_date, road_id)` |

### 3.3 路径表

| 表名 | 作用 | 主键 |
|---|---|---|
| `bfmap_ways_import` | BfMap CSV 原始导入表 | `gid` |
| `road_segments` | BfMap 路网边表（pgRouting 主图） | `road_id` 唯一 |
| `ingest_road_map` | 入仓路段到 BfMap 边映射 | `id` (bigserial) |
| `route_results` | 路径结果缓存表 | `id` (bigserial) |
| `route_comparisons` | 多策略路径对比记录 | `id` (bigserial) |
| `route_strategies` | 路径策略定义表 | `strategy_code` |

### 3.4 运营画像表

| 表名 | 作用 | 主键 |
|---|---|---|
| `ops_vehicle_profile` | 车辆画像（活跃天、里程、时段偏好） | `vehicle_id` |
| `ops_vehicle_tag` | 车辆标签（通勤、夜间活跃等） | `(vehicle_id, tag_code)` |
| `ops_vehicle_tag_summary` | 标签汇总统计 | `tag_code` |
| `ops_frequent_route` | 车辆常跑路段 | `id` (bigserial) |
| `ops_activity_ranking` | 车辆活跃排行 | `(rank_category, rank_num)` |

### 3.5 风险监测表

| 表名 | 作用 | 主键 |
|---|---|---|
| `risk_driver_fatigue` | 24h 窗口疲劳驾驶评估 | `(driver_id, window_start)` |
| `risk_driver_fatigue_event` | 疲劳/严重疲劳事件明细 | `id` (bigserial) |
| `risk_abnormal_running` | 异常长时间运行事件 | `id` (bigserial) |
| `risk_night_high_risk` | 夜间高风险事件 | `id` (bigserial) |
| `risk_summary` | 风险汇总 | `summary_date` |

### 3.6 报表表

| 表名 | 作用 | 主键 |
|---|---|---|
| `report_daily_summary` | 日报摘要 | `report_date` |
| `report_weekly_summary` | 周报摘要 | `(week_start, week_end)` |

### 3.7 治理表

| 表名 | 作用 | 主键 |
|---|---|---|
| `meta_asset_catalog` | 数据资产目录 | `asset_key` |
| `meta_available_time_range` | 数据可用时间范围 | `asset_key` |
| `meta_job_status` | 任务状态追踪 | `job_name` |
| `meta_data_quality_check` | 数据质量检查 | `check_key` |
| `ads_asset_portal_summary` | 资产门户摘要 | `asset_layer` |

## 4. 表间依赖关系

### 4.1 入仓依赖链

```
trips
  -> trip_points_raw
  -> trip_match_meta
  -> trip_points_matched
  -> trip_segments
```

### 4.2 统计依赖链

```
trips + trip_segments -> daily_metrics
trips + trip_segments -> daily_distance_boxplot
trips + trip_segments -> daily_speed_boxplot
trips + trip_segments -> hourly_metrics
trips + trip_segments -> road_daily_stats
trip_segments + ingest_road_map -> heatmap_bins
trip_segments + ingest_road_map -> road_speed_bins
```

### 4.3 路径依赖链

```
bfmap_ways.csv -> bfmap_ways_import -> road_segments
trip_match_meta + trip_segments + road_segments -> ingest_road_map
road_segments + road_speed_bins -> 路径搜索 -> route_results + route_comparisons
```

### 4.4 运营画像依赖链

```
trips + trip_segments -> ops_vehicle_profile
ops_vehicle_profile -> ops_vehicle_tag -> ops_vehicle_tag_summary
trips + trip_segments -> ops_frequent_route
ops_vehicle_profile -> ops_activity_ranking
```

### 4.5 风险监测依赖链

```
trips + trip_segments -> risk_driver_fatigue + risk_driver_fatigue_event
trips + trip_segments -> risk_abnormal_running
trips + trip_segments -> risk_night_high_risk
risk_driver_fatigue + risk_abnormal_running + risk_night_high_risk -> risk_summary
```

### 4.6 报表依赖链

```
daily_metrics + hourly_metrics + ops_vehicle_profile + risk_driver_fatigue -> report_daily_summary
report_daily_summary -> report_weekly_summary
```

### 4.7 治理依赖链

```
全部表（pg_class 元数据） -> meta_asset_catalog -> ads_asset_portal_summary
trips -> meta_available_time_range
ingest_runs -> meta_job_status
基础表 -> meta_data_quality_check
```

## 5. 模块输入输出契约

### 5.1 数据入仓模块

**入口**: `python -m app.etl.load_data --mode ingest`
**输入**: `data/*.h5`、`jldpath/*.jld2`
**输出**: `trips`、`trip_points_raw`、`trip_match_meta`、`trip_points_matched`、`trip_segments`、`ingest_runs`
**职责**: 文件级并行读取、chunk 级批量写入、解析/去重/补全/标记异常

### 5.2 数据库优化模块

**入口**: `python -m app.etl.load_data --mode optimize`
**输入**: 明细表
**输出**: 分区结构、索引结构、`ANALYZE` 结果
**职责**: 分区维护、索引创建/重建、`VACUUM/ANALYZE`

### 5.3 路网入仓模块

**入口**: 仅作为 `rebuild`/`refresh` 子流程
**输入**: `bfmap_ways.csv`、入仓明细
**输出**: `bfmap_ways_import`、`road_segments`、`ingest_road_map`
**职责**: BfMap CSV → pgRouting 边表，维护 `source/target/cost/reverse_cost`

### 5.4 统计聚合模块

**入口**: `python -m app.etl.refresh_stats` 或 `python -m app.etl.load_data --mode compute`
**输入**: `trips`、`trip_segments`、`ingest_road_map`
**输出**: 全部 8 张统计表（3.2 节）
**职责**: 日总览、箱形图、热力图、速度桶、小时聚合、道路日统计、行数统计
**刷新函数**: `stats_refresh_hourly_metrics()`、`stats_refresh_road_daily_stats()`

### 5.5 路径分析模块

**入口**: `POST /api/v1/route/compare`、`GET /api/v1/route/capability`
**输入**: 起点/终点/起始时间、路网图、速度桶
**输出**: `route_results`、`route_comparisons`（策略对比）
**职责**: SQL 级图搜索（pgRouting dijkstra）、Python 做参数校验和结果组装
**策略表**: `route_strategies` 定义可用的路径策略（`shortest`、`fastest`、`fastest_live` 等）

### 5.6 运营画像模块

**入口**: `python -m app.etl.refresh_ops` 或 `python -m app.etl.load_data --mode refresh-ops`
**输入**: `trips`、`trip_segments`
**输出**: `ops_vehicle_profile`、`ops_vehicle_tag`、`ops_vehicle_tag_summary`、`ops_frequent_route`、`ops_activity_ranking`
**职责**: 车辆画像聚合（活跃天/时段偏好/距离分布）、标签生成（通勤/夜间）、常跑路段排名、活跃排行
**刷新函数**: `ops_refresh_vehicle_profile()`、`ops_refresh_vehicle_tags()`、`ops_refresh_vehicle_tag_summary()`、`ops_refresh_frequent_routes()`、`ops_refresh_activity_ranking()`
**关键口径**:
- 高峰时段: 7-9AM 或 5-8PM
- 晨间: 6-9AM
- 夜间: 9PM-6AM
- 短途: < 5km
- 长途: >= 8km
- 通勤标签: 高峰 trip >= 2
- 夜间活跃标签: 夜间 trip >= 1

### 5.7 风险监测模块

**入口**: `python -m app.etl.refresh_risk` 或 `python -m app.etl.load_data --mode refresh-risk`
**输入**: `trips`、`trip_segments`
**输出**: `risk_driver_fatigue`、`risk_driver_fatigue_event`、`risk_abnormal_running`、`risk_night_high_risk`、`risk_summary`
**职责**: 24h 滚动窗口疲劳评估、单次异常长时检测、夜间高风险识别、汇总评估
**刷新函数**: `risk_refresh_driver_fatigue()`、`risk_refresh_abnormal_running()`、`risk_refresh_night_high_risk()`、`risk_refresh_summary()`
**关键口径**:
- 疲劳阈值: 24h 内运行 >= 12h
- 严重疲劳阈值: >= 14h
- 异常长时: 单次 trip >= 3h（中风险）/ >= 5h（高风险）/ >= 8h（严重）
- 夜间高风险时段: 22:00-5:00
- 夜间高风险距离: >= 50km（高）/ >= 20km（中）

### 5.8 运营报表模块

**入口**: `python -m app.etl.refresh_report` 或 `python -m app.etl.load_data --mode refresh-report`
**输入**: `daily_metrics`、`hourly_metrics`、`ops_vehicle_profile`、`risk_driver_fatigue`
**输出**: `report_daily_summary`、`report_weekly_summary`
**职责**: 固定经营口径的日报/周报生成
**刷新函数**: `report_refresh_daily()`、`report_refresh_weekly()`

### 5.9 数据治理模块

**入口**: `python -m app.etl.refresh_governance` 或 `python -m app.etl.load_data --mode refresh-governance`
**输入**: 全部表（系统目录）
**输出**: `meta_asset_catalog`、`meta_available_time_range`、`meta_job_status`、`meta_data_quality_check`、`ads_asset_portal_summary`
**职责**: 资产自动注册（从 `pg_class` 扫描）、可用日期范围推断、任务状态快照、质量检查（trip 完整性/segments 覆盖率/stat 表新鲜度）、门户分层摘要
**刷新函数**: `governance_refresh_assets()`、`governance_refresh_time_ranges()`、`governance_refresh_job_status()`、`governance_refresh_quality_checks()`、`governance_refresh_portal_summary()`

### 5.10 API 模块

**接口清单（当前稳定）**
- `GET /api/v1/summary/daily`
- `GET /api/v1/chart/daily-trip-count`
- `GET /api/v1/chart/daily-vehicle-count`
- `GET /api/v1/chart/daily-distance`
- `GET /api/v1/chart/daily-distance-boxplot`
- `GET /api/v1/chart/daily-speed-boxplot`
- `GET /api/v1/map/heatmap`
- `GET /api/v1/map/heatmap/buckets`
- `POST /api/v1/route/compare`
- `GET /api/v1/route/capability`

**待扩展** (新增模块 API):
- `GET /api/v1/ops/vehicle-profiles` — 运营画像查询
- `GET /api/v1/ops/frequent-routes` — 常跑路段
- `GET /api/v1/ops/activity-ranking` — 活跃排行
- `GET /api/v1/risk/fatigue` — 疲劳驾驶记录
- `GET /api/v1/risk/abnormal` — 异常运行记录
- `GET /api/v1/risk/summary` — 风险摘要
- `GET /api/v1/report/daily` — 日报
- `GET /api/v1/report/weekly` — 周报
- `GET /api/v1/governance/assets` — 数据资产
- `GET /api/v1/governance/quality` — 质量检查

**职责**: 参数校验、结果组装、错误统一收口
**实现约束**: 薄控制器模式（仅接收参数 → 调服务 → 返回响应），API 输出绑定 response model

### 5.11 前端模块

**输入**: API 返回值
**输出**: 页面、图表、地图
**职责**: 展示与交互、不直连数据库
**待扩展**: 运营画像面板、风险监测看板、报表展示页、数据治理视图

## 6. 执行模式

### 6.1 管线模式（load_data.py）

| 模式 | 做什么 | 不做什么 |
|---|---|---|
| `ingest` | 清理明细层、并行入仓、重建明细索引、analyze | 不刷新统计/路径 |
| `rebuild` | 清表、入仓、路网、统计聚合 + 全部模块刷新 | — |
| `refresh` | 路网映射 + 全部模块刷新（复用现有明细） | 不重新入仓 |
| `compute` | 全部模块刷新（stats → ops → risk → report → governance） | 不处理路网 |
| `optimize` | 索引维护、VACUUM/ANALYZE | 不改数据 |
| `smoke` | 验证聚合表有数据 | 不扫大表 |
| `runtime` | API 只读服务 | 不做计算 |

### 6.2 独立模块刷新模式

每个模块可独立执行，不依赖管线：

| 命令 | 刷新模块 |
|---|---|
| `python -m app.etl.refresh_stats` | 统计聚合（8 张表） |
| `python -m app.etl.refresh_ops` | 运营画像（5 张表） |
| `python -m app.etl.refresh_risk` | 风险监测（5 张表） |
| `python -m app.etl.refresh_report` | 运营报表（2 张表） |
| `python -m app.etl.refresh_governance` | 数据治理（5 张表） |
| `python -m app.etl.refresh_all` | 全部（按依赖顺序） |
| `python -m app.etl.refresh_all --modules ops,risk` | 指定模块 |
| `python -m app.etl.load_data --mode refresh-ops` | 通过统一入口执行单模块 |

## 7. 核心执行顺序（固定）

```
1. ingest（数据入仓，rebuild 模式）
2. 路网入仓模块（rebuild / refresh）
3. 统计聚合（stats: 8 张表）
4. 运营画像（ops: 5 张表）
5. 风险监测（risk: 5 张表）
6. 运营报表（report: 2 张表，依赖 stats + ops + risk）
7. 数据治理（governance: 5 张表，依赖全部）
8. API 服务（runtime）
```

刷新全流程: `python -m app.etl.refresh_all` 自动按以上依赖顺序执行。

## 8. 开发任务拆分

### 8.1 数据库层
1. 将大表改为按日期分区
2. 补齐必要索引
3. 增加可独立刷新的模块表

### 8.2 统计层
1. 预计算图表与指标
2. 每个模块有独立刷新入口
3. API 只读统计表

### 8.3 路网入仓模块
1. 建立 BfMap 路网边表
2. 维护入仓路段到 BfMap 边的映射

### 8.4 路径层
1. 数据库侧 pgRouting 搜索
2. 支持策略对比存储

### 8.5 运营画像层
1. 车辆画像聚合与标签生成
2. 活跃排行与常跑路段

### 8.6 风险监测层
1. 疲劳驾驶 24h 滚动窗口计算
2. 异常长时与夜间风险识别
3. 风险摘要

### 8.7 报表层
1. 日报/周报固定口径生成

### 8.8 治理层
1. 资产自动注册
2. 质量检查
3. 任务状态追踪

### 8.9 API 层
1. 保持接口稳定
2. 按模块扩展新端点

### 8.10 前端层
1. 消费 API
2. 按模块扩展新页面

## 9. 解耦约束

- 入仓模块不得调用前端。
- API 不得做大表现算。
- 统计模块不得依赖原始文件。
- 统计模块的道路相关产物不得绕过 `ingest_road_map` 直接映射。
- 路径模块不得扫描业务明细表。
- 前端不得直连数据库。
- 每个模块可独立刷新，可被外部调度器（cron）按需触发。
- 模块间通过 SQL 刷新函数或服务层调用连接，不通过文件耦合。

## 10. 交付顺序

1. 数据库结构与分区
2. 路网入仓模块
3. 统计预计算表
4. 运营画像与风险监测
5. 运营报表与数据治理
6. API 改读模型 + 新端点
7. 路径数据库化
8. 前端接稳定 API + 新页面

## 11. 与测试体系的关系

- 设计侧的模块边界由 `test_system.md` 验证。
- 任何模块都必须有独立的测试入口和独立的运行脚本。
- 当前测试覆盖：`backend/tests/` 下 11 个测试文件、39 项测试用例。
