# 实施版总纲

本文面向直接开发与重构，重点回答四件事：表怎么设计、模块怎么拆、流程怎么跑、谁依赖谁。

## 1. 设计目标

- 大表按日期分区，降低查询和维护成本。
- 所有展示型统计全部离线预计算。
- 路径搜索独立化，优先落到数据库。
- 模块之间只通过表、API 或稳定输入输出连接。

## 2. 模块地图

| 模块 | 输入 | 输出 | 禁止事项 |
|---|---|---|---|
| 数据入仓 | H5/JLD2/路网文件 | 明细表、入仓日志 | 不做统计、不做路径搜索 |
| BfMap 路网构建 | `bfmap_ways.csv` | `bfmap_ways_import`、`road_segments`（pgRouting 主图） | 不扫描业务明细表 |
| 映射生成 | 入仓明细 + `road_segments` | `ingest_road_map` | 不做图搜索 |
| 数据库优化 | 明细表 | 分区/索引/分析结果 | 不读原始文件、不直接返回前端 |
| 统计刷新 | 明细表、统计配置 | 统计表 | 不扫描前端请求、不做路径计算 |
| 路径搜索 | 起点/终点/时间、路网图数据 | 最短路/最快路结果 | 不扫业务明细表 |
| API 层 | 请求参数、统计表、路径结果 | JSON | 不做重计算 |
| 前端层 | API | 页面 | 不直连数据库 |

## 3. 数据库表设计

### 3.1 明细表

| 表名 | 作用 | 主键/唯一约束 | 分区键 | 关键字段 | 上游依赖 | 下游依赖 |
|---|---|---|---|---|---|---|
| `trips` | trip 基础信息 | `trip_uid` 唯一 | `trip_date` | `trip_id`、`source_trip_key`、`devid`、`trip_date`、`start_time`、`end_time`、`point_count`、`valid_point_count`、`is_valid`、`source_file` | H5 解析 | `trip_points_raw`、`trip_match_meta`、`trip_points_matched`、`trip_segments` |
| `trip_points_raw` | 原始轨迹点 | `(trip_id, point_seq)` 唯一 | `trip_date` | `trip_id`、`point_seq`、`event_time`、`tms`、`devid`、`lat`、`lon`、`speed`、`geom`、`is_valid`、`invalid_reason` | `trips` | `trip_points_matched`、`trip_segments` |
| `trip_match_meta` | 匹配元信息 | `(trip_id, point_seq)` 无重复 | `trip_date` | `trip_id`、`point_seq`、`matched_seq`、`road_id`、`road_name`、`direction`、`is_virtual`、`confidence`、`segment_fraction`、`raw_payload` | JLD2 解析 + `trips` | `trip_points_matched`、`trip_segments` |
| `trip_points_matched` | 匹配后轨迹点 | `(trip_id, point_seq)` 唯一 | `trip_date` | `trip_id`、`point_seq`、`event_time`、`tms`、`lat`、`lon`、`geom`、`road_id`、`road_name`、`matched_offset_m`、`confidence`、`is_virtual` | `trip_points_raw`、`trip_match_meta`、`trips` | `trip_segments`、`route_results`（间接） |
| `trip_segments` | 分段结果 | `(trip_id, segment_seq)` 唯一 | `trip_date` | `trip_id`、`segment_seq`、`from_point_seq`、`to_point_seq`、`start_time`、`end_time`、`distance_m`、`duration_s`、`avg_speed_kmh`、`road_id`、`road_name`、`path_geom`、`start_lat`、`start_lon`、`end_lat`、`end_lon` | `trip_points_matched`、`trip_match_meta`、`trips` | `daily_metrics`、`daily_distance_boxplot`、`daily_speed_boxplot`、`heatmap_bins`、`route_results` |

### 3.2 统计表

| 表名 | 作用 | 主键/唯一约束 | 刷新方式 | 输入依赖 | 在线查询原则 |
|---|---|---|---|---|---|
| `daily_metrics` | 日总览指标 | `metric_date` 主键 | 离线刷新 | `trips`、`trip_segments` | 只读，不回扫明细 |
| `daily_distance_boxplot` | 日里程箱形图 | `metric_date` 主键 | 离线刷新 | `trips`、`trip_segments` | 只读，不回扫明细 |
| `daily_speed_boxplot` | 日速度箱形图 | `metric_date` 主键 | 离线刷新 | `trips`、`trip_segments` | 只读，不回扫明细 |
| `heatmap_bins` | 热力图时间窗 | 无唯一约束 | 离线刷新 | `trip_segments`、`trip_points_matched`、`ingest_road_map` | 只读，不回扫明细 |
| `road_speed_bins` | 道路速度桶 | `road_id + bucket_start` 唯一 | 离线刷新 | `trip_segments`、`ingest_road_map` | 只读，不回扫明细 |
| `table_row_stats` | 表行数统计 | `table_name` 主键（建议） | 批量刷新 | 系统统计视图 + 维护任务 | 只读，不回扫明细 |

### 3.3 路径表

| 表名 | 作用 | 主键/唯一约束 | 输入依赖 | 输出依赖 |
|---|---|---|---|---|
| `bfmap_ways_import` | BfMap CSV 原始导入表 | `gid` 主键 | `bfmap_ways.csv` | `road_segments` |
| `road_segments` | BfMap 路网边表（pgRouting 主图） | `road_id` 唯一（=`gid`） | BfMap CSV | 路径搜索、映射生成 |
| `ingest_road_map` | 入仓路段到 BfMap 边映射 | `(trip_road_id, osm_id)` 或业务唯一键 | `trip_match_meta`、`trip_segments`、`road_segments` | 统计刷新、审计 |
| `route_results` | 路径结果表 | `id` 主键 | 路径搜索结果 | 前端路线展示、审计 |

## 4. 表间依赖关系

### 4.1 入仓依赖链

```text
trips
  -> trip_points_raw
  -> trip_match_meta
  -> trip_points_matched
  -> trip_segments
```

### 4.2 统计依赖链

```text
trips + trip_segments -> daily_metrics
trips + trip_segments -> daily_distance_boxplot
trips + trip_segments -> daily_speed_boxplot
trip_segments + trip_points_matched + ingest_road_map -> heatmap_bins
trip_segments + ingest_road_map -> road_speed_bins
```

### 4.3 路径依赖链

```text
bfmap_ways.csv -> bfmap_ways_import -> road_segments
trip_match_meta + trip_segments + road_segments -> ingest_road_map
road_segments + road_speed_bins -> 路径搜索 -> route_results
```

## 5. 模块输入输出契约

### 4.1 数据入仓模块

**输入**
- `data/*.h5`
- `jldpath/*.jld2`
- `bfmap_ways.csv`

**输出**
- `trips`
- `trip_points_raw`
- `trip_match_meta`
- `trip_points_matched`
- `trip_segments`
- `ingest_runs`

**职责**
- 文件级并行读取
- chunk 级批量写入
- 解析、去重、补全、标记异常

### 4.2 数据库优化模块

**输入**
- 明细表

**输出**
- 分区结构
- 索引结构
- `ANALYZE` 结果

**职责**
- 分区维护
- 索引创建/重建
- `VACUUM/ANALYZE`

### 4.3 BfMap 路网构建模块

**输入**
- `bfmap_ways.csv`

**输出**
- `bfmap_ways_import`
- `road_segments`

**职责**
- 从 BfMap CSV 构建 pgRouting 可用边表
- 维护 `source/target/cost/reverse_cost` 路由字段
- 维护 `gid/osm_id/class_id/length_m/geom` 业务字段

### 4.4 映射生成模块

**输入**
- `trip_match_meta`
- `trip_segments`
- `road_segments`

**输出**
- `ingest_road_map`

**职责**
- 优先按 `trip_segments.road_id == road_segments.road_id(gid)` 直连对齐
- 为热力图和路段速度桶提供稳定 join 键
- 沉淀映射审计字段（命中策略、版本、置信度）

### 4.5 统计刷新模块

**输入**
- `trips`
- `trip_segments`
- `trip_points_matched`
- `trip_match_meta`
- `ingest_road_map`

**输出**
- `daily_metrics`
- `daily_distance_boxplot`
- `daily_speed_boxplot`
- `heatmap_bins`
- `road_speed_bins`
- `table_row_stats`

**职责**
- 刷新前清理统计模块输出表
- 日总览
- 箱形图
- 热力图
- 道路速度桶
- 行数统计
- 热力图和道路速度桶刷新前必须完成 BfMap 路网和映射生成

### 4.6 路径搜索模块

**输入**
- 起点、终点、起始时间
- 查询时刻（`query_time`，用于速度桶命中）
- 路网边表/图数据（`road_segments`）
- 统计模块产物（`road_speed_bins`）

**输出**
- 最短路
- 最快路
- 边序列
- 累计距离/时间

**职责**
- 在数据库逻辑中完成图搜索
- Python 只做参数校验和结果包装
- 路径执行前必须通过统计模块初始化检查
- 路径主图仅使用 BfMap CSV 构建后的 `road_segments`
- `query_time` 直接按无时区 `datetime` 进行 5 分钟分桶
- 最快路在数据库侧通过 `road_segments` 与 `road_speed_bins` 关联计算动态 cost
- 当速度桶缺失时，最快路退化为静态权重最短路
- 退化或低速时允许最短路与最快路边序列一致
- 路径结果落库时保留查询时刻（无时区）和边序列（用于可审计与重放）

### 4.7 API 模块

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

**输入**
- 请求参数
- 统计表
- 路径结果

**输出**
- JSON

**职责**
- 参数校验
- 结果组装
- 错误统一收口

**实现约束（API 重构落地）**
- 路由层保持薄控制器模式：仅接收参数、调用服务、返回响应。
- 统计查询按域拆分为独立服务：`summary_query_service`、`chart_query_service`、`heatmap_query_service`。
- 路径查询按职责拆分：能力检查（`route_capability_service`）、图搜索（`route_search_service`）、结果组装（`route_payload_service`）、结果持久化（`route_persistence_service`）。
- 兼容层 `query_service` 可作为聚合导出入口，避免一次性破坏调用方。
- API 输出必须绑定响应模型（response model），以固定字段和类型契约。
- `route/compare` 的请求/响应应提供 OpenAPI 示例，降低联调歧义。
- `route/compare` 错误语义：参数模型错误走 422，服务侧可预期业务错误走 400。

### 4.8 前端模块

**输入**
- API 返回值

**输出**
- 页面、图表、地图

**职责**
- 展示与交互
- 不直连数据库
- 路线图层控制与结果面板控制分离（Clear Layers vs Clear Result）
- shortest/fastest 路径重合时提示用户
- 地图模块允许懒加载以降低首屏资源压力

## 6. 执行模式

| 模式 | 输入 | 输出 | 做什么 | 不做什么 |
|---|---|---|---|---|
| `ingest` | 源文件 | 明细表 | 清理明细层并并行入仓、重建明细索引、analyze | 不清理统计层和路径层依赖表 |
| `rebuild` | 源文件 | 明细表+路网+映射+统计表 | 清表/重建分区、入仓、导入 BfMap CSV、生成映射、刷新统计、准备路径资产 | 不保留旧明细 |
| `optimize` | 明细表 | 分区/索引/路网/统计 | 维护分区、索引、`VACUUM/ANALYZE`、维护 BfMap 路网与映射、刷新统计 | 不读原始文件 |
| `compute` | 明细表 | 统计表 | 在路网和映射可用前提下刷新统计表 | 不改明细结构 |
| `smoke` | 统计表、API | 读验证结果 | 验证读链路 | 不扫大表 |
| `runtime` | 统计表、路径结果 | API 响应 | 提供在线查询 | 不做离线计算 |

## 7. 核心执行顺序（固定）

1. `ingress`
2. `BfMap 路网生成`
3. `映射生成`
4. `stats`
5. `route search`

## 7. 开发任务拆分

### 6.1 数据库层

1. 将大表改为按日期分区。
2. 补齐必要索引。
3. 增加统计表和行数统计表。
4. 建立路网边表。

### 6.2 统计层

1. 把所有图表与指标预计算。
2. 刷新逻辑统一放入 `rebuild/optimize/compute`。
3. API 只读统计表。

### 6.3 路径层

1. 准备数据库路径搜索数据。
2. 将 Python 图遍历替换为数据库调用。

### 6.4 API 层

1. 保持接口稳定。
2. 让接口只做轻逻辑。
3. 按服务分层拆分查询与路径逻辑，避免单文件膨胀。
4. 为关键接口配置 response model 和 OpenAPI example。
5. 通过契约测试和 SQL 审计测试确保 API 不读取明细表。

### 6.5 前端层

1. 只消费 API。
2. 不加入业务计算。

## 8. 解耦约束

- 入仓模块不得调用前端。
- API 不得做大表现算。
- 统计模块不得依赖原始文件。
- 统计模块的道路相关产物不得绕过 `ingest_road_map` 直接映射。
- 路径模块不得扫描业务明细表。
- 前端不得直连数据库。

## 9. 交付顺序

1. 数据库结构与分区
2. BfMap 路网构建
3. 映射生成
4. 统计预计算表
5. API 改读模型
6. 路径数据库化
7. 前端接稳定 API

## 10. 与测试体系的关系

- 设计侧的模块边界由 `test_system.md` 验证。
- 任何模块都必须有独立的测试入口和独立的运行脚本。
