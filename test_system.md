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

### 3.5 API 模块

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

### 3.6 前端模块

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
| `make test` | 默认回归总入口 | API + 统计 + 前端 | 是 |
| `make smoke` | 冒烟验证 | 健康检查 + 少量统计表 | 是 |
| `make test-ingest` | 入仓验证 | 入仓模块测试 | 否 |
| `make test-db` | 分区/索引/维护验证 | 数据库优化模块测试 | 是 |
| `make test-stats` | 统计口径验证 | 统计刷新模块测试 | 是 |
| `make test-route` | 路径模块验证 | 路径搜索模块测试 | 是 |
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

### 6.6 前端

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
