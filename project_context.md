# 项目运行上下文

本文记录本项目的本地运行环境、输入资源、数据库连接和执行约束，供 AI 和人工共同遵循。

## 1. 目标

构建一个面向哈尔滨车辆轨迹数据的网站系统，支持入仓、路网入仓模块、统计、热力图、路线评估和前端展示。

## 2. 技术栈

- 数据库：本地 PostgreSQL + PostGIS
- 后端：FastAPI
- 前端：React + Vite
- Python 环境：`/Users/apple/python_data/bin/python`
- Python 包管理：`uv`

## 3. 本地数据库

- 主机：`localhost`
- 端口：`5432`
- 数据库：`harbin_traffic`
- 用户：`apple`
- 密码：空（本地信任连接）
- SQLAlchemy URL：`postgresql+psycopg://apple@localhost:5432/harbin_traffic`
- psycopg conninfo：`dbname=harbin_traffic user=apple host=localhost port=5432`

## 4. 核心输入

- 原始轨迹：`data/*.h5`
- map-matching 结果：`jldpath/*.jld2`
- 路网文件：`bfmap_ways.csv`
- 视觉参考：`stitch_route_planning_optimization.zip`

## 5. 关键规则

- 不使用 BigQuery + Looker。
- 不使用 Julia 作为主链路。
- `H5` 和 `JLD2` 共同作为输入。
- 里程必须按路段分段距离累加。
- 在线查询必须走数据库，不直接读原始文件。

## 6. 数据流

```text
H5 + JLD2 -> ingress
bfmap_ways.csv + ingest 明细 -> 路网入仓模块(road_segments, ingest_road_map)
路网入仓模块就绪后 -> 统计刷新(stats)
路网 + 统计就绪后 -> 路径搜索(route search)
FastAPI -> React
```

固定执行顺序：`ingress -> 路网入仓模块 -> stats -> route search`。

## 7. 运行模式

- `rebuild`：重建明细表、路网入仓模块并刷新统计表。
- `optimize`：不入仓，只做数据库优化。
- `compute`：只刷新统计表（要求路网与映射已就绪）。
- `smoke`：只验证统计表和接口，不扫描大表。

## 8. 入仓规则

- H5 和 JLD2 按文件级 worker 处理。
- 每个 worker 负责一个源文件的打开、分块转换、chunk COPY、关闭。
- 不需要 CSV/Parquet 中间层。
- 大表应按日期分区，降低日维度查询和维护成本。
- 所有展示型统计结果必须提前计算并持久化。

## 9. 回归约束

- 默认回归不执行入仓。
- 入仓验证属于单独的运维任务。
- 默认回归仅覆盖统计、接口和前端展示链路。

## 10. 文档入口

- 主设计总纲：`spec.md`
- 实施版总纲：`implementation_guide.md`
- 测试体系总纲：`test_system.md`

## 11. 当前文档结构

- `spec.md`：总原则、边界、全局约束
- `implementation_guide.md`：表、模块、执行、依赖
- `test_system.md`：模块测试与脚本规范

## 10. 主输出

- 热力图回放
- 每日 trip 数
- 每日车辆数
- 每日里程折线图
- 每日里程箱形图
- 每日速度箱形图
- 路线对比结果
