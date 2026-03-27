# 哈尔滨车辆轨迹分析系统设计总纲

本文是本项目的主设计文档，面向 AI 和人工共同阅读，用于直接指导代码实现、数据库设计和接口拆分。

## 1. 项目目标

以哈尔滨 5 天车辆行程数据为基础，完成轨迹入仓、BfMap 路网导入与构建、映射对齐、统计预计算、路线评估和前端可视化展示，提供可公开访问的网站和 API。

## 2. 设计原则

- 事实源与读模型分离：明细表只负责存事实，统计表只负责在线读。
- 入仓与查询解耦：入仓只处理写入，查询只读统计结果。
- 统计分层：路网无关统计可提前计算，路网相关统计必须在路网与映射准备完成后计算。
- 路径搜索独立化：路径搜索必须单独成模块，优先在数据库中执行。
- 模块边界清晰：每个模块只对外暴露稳定输入和输出，不跨层调用内部实现。

## 3. 总体流程

```text
H5/JLD2 原始文件
  -> 入仓(ingest)
  -> 路网入仓模块(road_segments, ingest_road_map)
  -> 统计刷新(compute)
  -> 路径搜索(route search)
  -> 在线服务(runtime)
```

### 3.1 运行模式

- `ingest`：只执行入仓编排，清理并重建明细层，不清理统计层和路径依赖表。
- `rebuild`：总编排入口，串联入仓、路网入仓模块、统计刷新、路径能力准备与运行链路校验；其中路网构建和映射生成不单独暴露运行入口。
- `optimize`：不触碰源文件，只做入仓明细层的分区、索引、`VACUUM/ANALYZE` 维护。
- `compute`：不入仓，只在路网和映射可用前提下刷新统计表。
- `smoke`：只验证统计表和 API 可用性，不扫描大表。
- `runtime`：日常服务态，API 仅读统计表和路径结果。

## 4. 数据分层

### 4.1 原始层

- 输入：`data/*.h5`、`jldpath/*.jld2`
- 作用：离线输入与归档，不作为在线查询主存储。

### 4.2 明细层

- `trips`：trip 基础信息
- `trip_points_raw`：原始轨迹点
- `trip_match_meta`：匹配与补点元信息
- `trip_points_matched`：路网匹配后的点
- `trip_segments`：相邻点之间的分段结果

### 4.3 统计层

- `daily_metrics`：每日总览指标
- `daily_distance_boxplot`：每日里程箱形图
- `daily_speed_boxplot`：每日速度箱形图
- `heatmap_bins`：热力图时间窗聚合
- `road_speed_bins`：道路 5 分钟速度桶（路径最快路权重输入）
- `table_row_stats`：表级行数与更新时间统计（新增，建议）

### 4.4 路径层

- `bfmap_ways_import`：BfMap 导出 CSV 原始导入表
- `road_segments`：由 `bfmap_ways_import` 构建的 pgRouting 主图
- `ingest_road_map`：入仓路段与 BfMap 路网边映射表
- `route_results`：路线评估结果
- 路径搜索逻辑应依赖独立的图查询数据，不直接扫业务明细表。

## 5. 表与分区建议

### 5.1 分区策略

- `trips`：按 `trip_date` 分区
- `trip_points_raw`：按 `trip_date` 分区
- `trip_points_matched`：按 `trip_date` 分区
- `trip_match_meta`：按 `trip_date` 分区
- `trip_segments`：按 `trip_date` 分区
- `heatmap_bins`：按 `metric_date` 分区

### 5.2 索引策略

- `trips(trip_date)`、`trips(devid, trip_date)`
- `trip_points_raw(trip_id, point_seq)`、`trip_points_matched(trip_id, point_seq)`
- `trip_match_meta(trip_id, point_seq)`、`trip_match_meta(road_id)`
- `trip_segments(trip_id, segment_seq)`、`trip_segments(road_id)`
- `heatmap_bins(metric_date, time_bucket_start)`、`heatmap_bins(road_id)`

### 5.3 维护策略

- 大表必须定期 `ANALYZE`，必要时执行 `VACUUM`。
- `rebuild` 前必须清空对应分区或重建分区。
- 统计表与明细表分开维护，避免在线查询时重算。

## 6. 模块边界

### 6.1 数据入仓模块

- 输入：H5/JLD2
- 输出：明细表 + 入仓日志
- 职责：解析、去重、补全、分块写入
- 编排约束：`ingest` 仅清理入仓明细表，不清理统计层和路径层依赖表
- 不做：统计刷新、路径搜索、前端展示

### 6.2 路网入仓模块

- 输入：`bfmap_ways.csv`、入仓明细（`trip_match_meta`、`trip_segments`）
- 输出：`bfmap_ways_import`、`road_segments`、`ingest_road_map`
- 职责：导入 BfMap 边表 CSV、构建 pgRouting 主图、生成入仓路段到 BfMap 边的映射
- 编排约束：该模块仅作为 `rebuild` 子流程存在，不单独暴露运行入口
- 不做：业务统计、API 请求处理、图搜索

### 6.3 数据库优化模块

- 输入：明细表
- 输出：分区状态、索引状态、`VACUUM/ANALYZE` 结果
- 职责：分区、索引、`VACUUM/ANALYZE`
- 不做：读取原始文件、统计刷新、前端请求处理、路径搜索请求编排

### 6.4 统计刷新模块

- 输入：明细表 + `ingest_road_map`
- 输出：统计表（含 `road_speed_bins`）
- 职责：先清理统计模块表，再刷新预计算结果
- 依赖约束：热力图和道路速度桶依赖 `road_segments` 与 `ingest_road_map` 已完成
- 不做：分区、索引、`VACUUM/ANALYZE`、读取原始文件、路径搜索请求编排

### 6.5 独立路径搜索模块

- 输入：起点、终点、起始时间
- 输出：最短路、最快路、边序列、累计距离和时间
- 职责：在数据库 `pgRouting` 中完成带权最短路径计算（最短路=距离权重，最快路=时间权重）
- 依赖约束：路径搜索依赖 BfMap 路网完成构建，并依赖统计模块完成初始化
- 退化策略：当 `road_speed_bins` 无可用速度桶时，最快路退化为最短路
- 不做：扫描业务明细表、重新计算统计指标

### 6.6 API 模块

- 输入：请求参数 + 统计表/路径结果
- 输出：JSON
- 职责：参数校验、结果组装、错误处理
- 不做：重计算、批量入仓、路网构建

### 6.7 前端模块

- 输入：API 返回值
- 输出：图表、地图、交互页面
- 职责：展示与交互
- 不做：直连数据库、业务计算

## 7. 指标口径

- trip 里程以分段距离累加，不允许使用首尾直线距离替代。
- 每日 trip 数按有效 trip 去重统计。
- 每日车辆数按 `devid` 去重统计。
- 每日里程、箱形图、热力图均以离线预计算结果为准。

## 8. API 约定

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

API 规则：

- 所有图表接口必须优先读取统计表。
- 热力图接口只能读取热力图结果表。
- 路径接口只能调用路径搜索模块，不能直接在 API 层遍历大图。
- API 返回结构应由响应模型固定契约，避免字段漂移。
- API 文档（OpenAPI）应为关键接口提供请求/响应示例，保障前后端联调一致。
- API 模块应通过自动化审计测试验证“只读统计/路径结果”，禁止回扫明细大表。

## 9. 路径搜索方案

- 优先方案：使用数据库图查询能力（推荐 `pgRouting`）。
- 备选方案：纯 SQL 递归查询，仅用于过渡或验证。
- Python 只负责参数校验和结果格式化，不负责整图 traversal。
- 最快路权重必须在数据库侧通过 `road_segments LEFT JOIN road_speed_bins` 计算，不在 Python 中拼接动态 SQL。
- 路径主图以 BfMap CSV 构建的 `road_segments` 为准，不以 H5/JLD2 直接替代路网拓扑。
- 入仓路段与 BfMap 路段的对应关系通过 `ingest_road_map` 维护。
- 路径搜索执行前必须通过统计模块初始化校验（至少具备 `table_row_stats` 的统计链路标记）。
- 若请求时间桶无速度数据，最快路退化为静态权重路径，并与最短路保持一致。
- 路径链路采用无时区 `datetime` 语义：传入时间、分桶时间、落库时间均按同一钟面时间处理，不做时区换算。
- `route/compare` 前端交互应同时暴露 `start_time` 与 `query_time`，避免混淆行程时间与速度桶查询时间。
- 前端路线对比视图应支持 shortest/fastest 地图图层显隐控制，并提供一键清除路线图层，避免与热力图播放叠加干扰。
- 前端应支持“清空路线结果面板”与“清空路线图层”分离操作，避免控制耦合。
- 当 shortest 与 fastest 路径完全一致时，前端应明确提示路径重合状态。
- `query_time` 直接按 5 分钟分桶得到 `bucket_start`，作为速度桶命中键。
- `route_results.query_time` 必须落用户查询时刻（无时区），不能写服务端当前时间。

## 10. 技术约束

- 数据处理：Python + `uv`
- 数据库：PostgreSQL + PostGIS
- 后端：FastAPI
- 前端：React + Vite + TypeScript
- 不使用 BigQuery、Looker 或 Julia 作为主链路。

## 11. 本地运行信息

- 数据库：`harbin_traffic`
- 主机：`localhost`
- 端口：`5432`
- 用户：`postgres`
- 连接串：`postgresql+psycopg://postgres:postgres@localhost:5432/harbin_traffic`
- `psycopg` 连接信息：`dbname=harbin_traffic user=postgres host=localhost port=5432 password=postgres`
- Python：`/Users/apple/python_data/bin/python`
- pgRouting 本地配置与专项测试：`docs/pgrouting_environment.md`

## 12. 实施版总纲

- 具体表清单、接口清单和任务拆分见 `implementation_guide.md`。
- `spec.md` 负责原则、边界和全局约束；`implementation_guide.md` 负责落地顺序和执行细节。
- 测试体系总纲见 `test_system.md`。
- 字段级契约和表依赖关系以 `implementation_guide.md` 为准。

## 13. 验收标准

1. 5 天数据可完整展示。
2. 图表、热力图、路线评估均可交互。
3. 统计接口不依赖大表在线重算。
4. 路径搜索与统计模块边界清晰可替换。
5. 模块之间仅通过表、API 或稳定输入输出交互。
