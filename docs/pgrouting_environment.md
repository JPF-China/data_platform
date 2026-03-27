# 路径扩展（pgRouting）测试环境配置与验证

本文档提供可复用的 pgRouting 本地测试环境配置步骤，并给出专项测试命令。

## 1. 适用范围

- 本地开发机（macOS + Homebrew PostgreSQL）
- CI 专项任务（需保证 PostgreSQL 已安装 pgRouting 扩展文件）

## 2. 本地环境配置（Homebrew）

1) 安装依赖

```bash
brew install postgresql@18 postgis pgrouting
```

2) 启动 PostgreSQL（示例使用 18）

```bash
brew services start postgresql@18
```

3) 初始化数据库结构

```bash
psql "dbname=harbin_traffic user=postgres host=localhost port=5432 password=postgres" -f infra/postgres/bootstrap.sql
```

4) 启用扩展并验证

```bash
psql "dbname=harbin_traffic user=postgres host=localhost port=5432 password=postgres" -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgrouting;"
psql "dbname=harbin_traffic user=postgres host=localhost port=5432 password=postgres" -c "SELECT extname FROM pg_extension WHERE extname IN ('postgis','pgrouting') ORDER BY extname;"
```

预期输出包含 `postgis` 与 `pgrouting`。

## 3. 测试数据库约束

- 路径模块测试使用独立测试库（默认 `harbin_test`）
- 由 `backend/tests/conftest.py` 自动建库、建表、写入最小种子数据
- 不依赖线上业务库数据

## 4. pgRouting 专项测试

推荐命令：

```bash
make test-route
```

对应测试覆盖：

- `backend/tests/test_route_graph_regression.py`
- `backend/tests/test_route_database_search.py`
- `backend/tests/test_route_capability.py`

## 5. 本地与 CI 执行策略

- 本地：若无 pgRouting，可允许相关用例 skip。
- CI：应提供 pgRouting 扩展环境并强制执行 `make test-route`，不允许因缺扩展跳过核心能力验证。

## 6. 常见问题

1) `extension "pgrouting" is not available`

- 原因：数据库服务所在 PostgreSQL 实例未安装 pgRouting 扩展文件。
- 处理：确认 `brew install pgrouting` 后，重启对应 PostgreSQL 版本服务，再执行 `CREATE EXTENSION pgrouting`。

2) `stats module is not initialized for routing`

- 原因：路径模块加入了统计初始化门禁。
- 处理：先执行统计刷新链路，或确保 `table_row_stats` 中存在 `road_speed_bins` 记录。
