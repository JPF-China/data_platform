# 测试体系总纲

本文定义测试如何按模块拆分、如何执行、如何映射到脚本。目标是让测试本身也保持解耦。

## 1. 测试原则

- 测试必须按模块拆分。
- 默认回归不执行入仓和大表在线聚合。
- 每个模块至少有一组自动化测试。
- 运维类入仓验证单独保留，不进入默认回归。

## 2. 测试分层

### 2.1 模块测试

- 入仓模块测试
- 数据库优化测试
- 统计刷新测试
- 路径搜索测试
- 运营画像测试
- 风险监测测试
- 运营报表测试
- 数据治理测试
- API 测试
- 前端测试

### 2.2 运行层测试

- `smoke`：只验证健康检查和关键统计表。
- `compute`：只验证统计结果正确性。
- `rebuild`：仅运维验证，不进默认回归。

## 3. 模块测试规范

### 3.1 入仓模块

**测试重点**
- 解析正确性
- chunk 写入正确性
- 去重正确性
- 异常标记正确性
- `ingest` 模式不清理统计层和路径依赖表

**测试类型**
- 自动化：小样本单元测试
- 手工：全量重建运维验证

**脚本建议**
- `make test-ingest`

**建议测试文件**
- `backend/tests/test_ingest_pipeline.py`
- `backend/tests/test_ingest_validation.py`

### 3.2 数据库优化模块

**测试重点**
- 分区是否存在
- 索引是否存在
- `ANALYZE` 是否更新
- `VACUUM` 是否可执行

**测试类型**
- 自动化：SQL 级检查
- 手工：维护窗口执行

**脚本建议**
- `make test-db`

**建议测试文件**
- `backend/tests/test_db_maintenance.py`
- `backend/tests/test_partition_policy.py`

### 3.3 统计刷新模块

**测试重点**
- 统计口径正确
- 结果表有数据
- 刷新后不依赖明细在线重算
- `road_speed_bins` 作为正式统计产物可用

**测试类型**
- 自动化：结果校验
- 自动化：与明细聚合对账

**脚本建议**
- `make test-stats`

**建议测试文件**
- `backend/tests/test_stats_refresh.py`
- `backend/tests/test_stats_contract.py`

### 3.4 路径搜索模块

**测试重点**
- 路径可达
- 最短路/最快路稳定
- 边序列连续
- 累计距离/时间正确
- 依赖统计模块初始化完成
- `query_time` 的无时区分桶正确（5 分钟桶）
- 速度桶命中与回退逻辑正确（有桶用桶，无桶回退静态权重）
- 同一路径不同时间桶可出现“距离相同、耗时不同”的结果
- 路径结果落库时间字段与请求 `query_time` 一致（无时区）

**测试类型**
- 自动化：小图或样本路径测试
- 手工：复杂路线验证

**脚本建议**
- `make test-route`

**建议测试文件**
- `backend/tests/test_route_graph_regression.py`
- `backend/tests/test_route_database_search.py`

### 3.5 运营画像模块

**测试重点**
- 车辆画像表结构正确（`ops_vehicle_profile`）
- 标签生成逻辑正确（通勤/夜间活跃）
- 标签汇总统计正确
- 常跑路段计算正确
- 活跃排行排序正确
- 刷新函数幂等（TRUNCATE + INSERT）
- 画像表数据与明细可对账

**测试类型**
- 自动化：表结构与刷新验证

**脚本建议**
- `make test-ops`

**实际测试文件**
- `backend/tests/test_ops_profile_schema.py` — 表结构测试
- `backend/tests/test_ops_profile_extended.py` — 频繁路线 + 活跃排行
- `backend/tests/test_ops_refresh_functions.py` — 画像刷新函数

### 3.6 风险监测模块

**测试重点**
- 疲劳驾驶表结构正确（`risk_driver_fatigue`、`risk_driver_fatigue_event`）
- 24h 窗口运行分钟计算正确
- 疲劳/严重疲劳分类正确（>=12h / >=14h）
- 异常长时间运行检测正确（>=3h 单次）
- 夜间高风险识别正确（22:00-5:00 夜间行驶）
- 风险摘要汇总正确
- 刷新函数可重复执行

**测试类型**
- 自动化：表结构与刷新验证

**脚本建议**
- `make test-risk`

**实际测试文件**
- `backend/tests/test_risk_monitoring_schema.py` — 表结构测试
- `backend/tests/test_risk_monitoring_extended.py` — 异常运行 + 夜间风险 + 摘要
- `backend/tests/test_risk_refresh_functions.py` — 风险刷新函数

### 3.7 运营报表模块

**测试重点**
- 日报表结构正确（`report_daily_summary`）
- 周报表结构正确（`report_weekly_summary`）
- 报表指标口径正确（引用 stats/ops/risk 表）
- 周报按周聚合正确
- 刷新函数可重复执行

**测试类型**
- 自动化：表结构与刷新验证

**脚本建议**
- `make test-report`

**实际测试文件**
- `backend/tests/test_reports_schema.py` — 报表表结构与刷新

### 3.8 数据治理模块

**测试重点**
- 资产目录自动注册（从 `pg_class` 扫描所有 public schema 表）
- 时间范围推断正确（从 `trips` 表获取 min/max date）
- 任务状态快照正确（从 `ingest_runs` 获取最新状态）
- 质量检查规则执行正确（trip 完整性、segments 覆盖率、stat 表新鲜度）
- 门户摘要按 `asset_layer` 聚合正确
- 刷新函数可重复执行

**测试类型**
- 自动化：表结构与刷新验证

**脚本建议**
- `make test-governance`

**实际测试文件**
- `backend/tests/test_governance_schema.py` — 表结构测试
- `backend/tests/test_governance_refresh.py` — 治理刷新函数

### 3.9 统计聚合扩展

**测试重点**
- `hourly_metrics` 小时聚合正确
- `road_daily_stats` 道路日统计正确
- 刷新函数依赖正确（需 stats 刷新后执行）

**测试类型**
- 自动化：表结构与刷新验证

**实际测试文件**
- `backend/tests/test_stats_agg_extended.py` — 小时指标 + 道路日统计

### 3.10 路径分析扩展

**测试重点**
- `route_comparisons` 策略对比记录正确
- `route_strategies` 策略定义表可读可写
- 对比表自动计算 `favor_strategy` 生成列

**测试类型**
- 自动化：表结构验证

**实际测试文件**
- `backend/tests/test_route_analysis_schema.py` — 路线对比表 + 策略表

### 3.11 API 模块

**测试重点**
- 契约稳定
- 只读统计表
- 返回结构正确
- 错误处理一致
- OpenAPI 示例存在且结构有效
- SQL 审计层面不回扫明细表

**测试类型**
- 自动化：pytest API 集成测试

**脚本建议**
- `make test-api`

**建议测试文件**
- `backend/tests/test_api_regression.py`
- `backend/tests/test_api_contract.py`

**建议新增断言（已落地方向）**
- 统计接口在明细表清空后仍可读取预计算结果。
- 通过 SQL 监听/审计断言 `summary` 等接口不触发 `trips`、`trip_segments`、`trip_points_raw`、`trip_points_matched`、`trip_match_meta` 读取。
- `route/compare` 的 `ValueError` 统一映射为 HTTP 400。
- 点位越界等请求模型错误返回 HTTP 422。
- `/openapi.json` 中关键接口（如 `summary/daily`、`route/compare`）包含请求或响应示例。

### 3.12 前端模块

**测试重点**
- 页面渲染
- 图表渲染
- 热力图交互
- 路线交互

**测试类型**
- 自动化：组件/页面测试
- 手工：复杂交互检查

**脚本建议**
- `make test-fe`

**建议测试文件**
- `frontend/src/App.test.tsx`
- `frontend/src/components/*.test.tsx`

## 4. 测试脚本规范

| 脚本 | 职责 | 输入范围 | 默认回归 |
|---|---|---|---|
| `make test` | 默认回归总入口 | API + 统计 + ops + risk + 前端 | 是 |
| `make smoke` | 冒烟验证 | 健康检查 + 少量统计表 | 是 |
| `make test-ingest` | 入仓验证 | 入仓模块测试 | 否 |
| `make test-db` | 分区/索引/维护验证 | 数据库优化模块测试 | 是 |
| `make test-stats` | 统计口径验证 | 统计刷新模块 + 扩展统计测试 | 是 |
| `make test-ops` | 运营画像验证 | ops_profile/ops_profile_extended/ops_refresh 测试 | 是 |
| `make test-risk` | 风险监测验证 | risk_monitoring/risk_extended/risk_refresh 测试 | 是 |
| `make test-report` | 报表验证 | reports_schema 测试 | 是 |
| `make test-governance` | 治理验证 | governance_schema/governance_refresh 测试 | 是 |
| `make test-route` | 路径模块验证 | 路径搜索 + 路线分析测试 | 是 |
| `make test-api` | API 契约验证 | API 模块测试 | 是 |
| `make test-fe` | 前端验证 | 前端模块测试 | 是 |

## 5. 测试用例映射原则

- 一个模块至少对应一组测试脚本。
- 一个测试脚本尽量只覆盖一个模块。
- 如果一个用例跨多个模块，应拆成多个独立断言。
- 路径测试与统计测试必须隔离。
- API 契约测试与路径算法测试必须隔离；API 仅验证契约与边界，不复验整图算法正确性。

## 6. 推荐用例集合

### 6.1 入仓

- 小样本入仓成功
- chunk 写入成功
- 重复 trip 不重复入库
- 失败后可重试
- 入仓后行数与源文件一致

### 6.2 数据库优化

- 大表分区存在
- 索引存在
- `ANALYZE` 更新成功
- 关键查询命中分区
- 维护任务不破坏统计表

### 6.3 统计

- `daily_metrics` 正确
- boxplot 正确
- heatmap 正确
- 统计接口不扫大表
- 统计表与明细对账一致

### 6.4 路径

- 最短路返回
- 最快路返回
- 路径边连续
- 数据库路径结果可复现
- Python 不做整图遍历

### 6.5 API

- 健康检查
- 统计接口
- 路线接口
- 返回结构稳定
- 错误码一致

### 6.6 运营画像

- 车辆画像聚合结果与明细对账一致
- 标签生成阈值正确（通勤: peak>=2, 夜间活跃: night>=1）
- 常跑路段排名正确
- 活跃排行分 `trip_count` 和 `distance` 两维度
- 画像空表可安全刷新

### 6.7 风险监测

- 疲劳评估 24h 窗口计算正确
- 疲劳/严重分类边界正确（720min / 840min）
- 异常长时分类正确（180min / 300min / 480min）
- 夜间风险距离阈值正确（50km / 20km）
- 风险摘要汇总与明细对账一致

### 6.8 运营报表

- 日报引用指标口径正确
- 周报按 ISO 周聚合正确
- 报表空数据日可安全刷新

### 6.9 数据治理

- 资产自动注册覆盖全部 public schema 表
- 时间范围 min/max 正确
- 质量检查覆盖 5 类规则
- 门户摘要按层分组正确

### 6.10 前端

- 页面加载
- 图表渲染
- 交互可用
- 页面不直连数据库
- 组件只消费 API

## 7. 回归边界

- 默认回归不做全量入仓。
- 默认回归不做大表实时聚合。
- 路径模块可单独回归。
- 统计模块可单独回归。
