# 项目说明文档

本文档面向第一次接手该仓库的开发者，帮助快速理解项目目标、代码结构、数据依赖，以及推荐的本地开发方式。

## 1. 项目定位

这是一个面向哈尔滨车辆轨迹数据的分析平台，当前能力集中在三类场景：

- 轨迹数据入仓：将 `H5` 与 `JLD2` 数据写入 PostgreSQL。
- 离线统计分析：生成日级指标、里程/速度箱线图、道路热力图时间桶。
- 路径分析：基于 `pgRouting` 对比最短路径与最快路径。

前端负责展示分析结果与地图交互，后端负责 API、统计查询和路径计算，数据库负责空间数据、统计结果和路径图搜索。

## 2. 整体架构

核心链路如下：

```text
data/*.h5 + jldpath/*.jld2
  -> ETL 入仓
  -> 路网映射 / road_segments 构建
  -> 统计聚合（daily_metrics / heatmap_bins / road_speed_bins）
  -> FastAPI API
  -> React + Vite 前端
```

其中：

- `bfmap_ways.csv` 是路径搜索和道路映射的核心路网输入。
- PostgreSQL 容器会启用 `PostGIS` 与 `pgRouting`。
- 路径对比依赖统计模块先生成 `road_speed_bins`，否则最快路会退化或被判定为能力未就绪。

## 3. 代码结构

- `backend/`
  - `app/api/`：HTTP 路由与依赖注入。
  - `app/services/`：统计查询、入仓、路网映射、路径搜索等服务逻辑。
  - `app/etl/load_data.py`：主 ETL 入口，支持 `rebuild`、`refresh`、`compute` 等模式。
  - `tests/`：后端回归与专项测试。
- `frontend/`
  - `src/App.tsx`：主界面，包含总览、热力回放、路径对比三块页面。
  - `src/api.ts`：前端 API 封装。
- `infra/postgres/`
  - 初始化 SQL、统计表与数据库镜像构建。
- `scripts/`
  - `prepare_data.sh`：下载并准备原始数据。
  - `start.sh` / `stop.sh`：便捷启动与停止脚本。
- `docs/`
  - 当前目录主要放补充说明文档。

## 4. 数据依赖

项目运行依赖三类输入：

- `data/*.h5`：原始轨迹数据。
- `jldpath/*.jld2`：map-matching 结果。
- `bfmap_ways.csv`：路网边数据，仓库已自带。

当前仓库中已经存在：

- `bfmap_ways.csv`
- `harbin.osm.pbf`

其中 `harbin.osm.pbf` 目前更像参考资源，实际主流程直接消费的是 `bfmap_ways.csv`。

原始数据准备脚本为 `scripts/prepare_data.sh`，会：

1. 下载主数据压缩包与补充数据压缩包。
2. 校验解压目录中必须存在 `deepgtt-h5/` 与 `jldpath/`。
3. 将 `*.h5` 复制到仓库根目录 `data/`。
4. 将 `*.jld2` 复制到仓库根目录 `jldpath/`。

执行前需要先安装 `7z`，macOS 可用：

```bash
brew install p7zip
```

执行命令：

```bash
make data-prepare
```

如果默认下载地址需要替换，可通过环境变量覆盖：

```bash
DATA_ARCHIVE_URL_MAIN="<主数据链接>" \
DATA_ARCHIVE_URL_EXTRA="<补充数据链接>" \
make data-prepare
```

## 5. 运行模式说明

### 5.1 便捷启动脚本

`./scripts/start.sh` 适合“快速跑起来”，默认行为是：

- 若已有数据库卷，则切到仅前端启动。
- 若没有数据库卷，则拉起完整栈。

这条链路更偏演示/复用，不是真正的热更新开发模式。

### 5.2 推荐开发模式

开发时建议直接使用 Compose 叠加 `docker-compose.dev.yml`：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

这会带来两点变化：

- 后端使用 `uvicorn --reload`。
- 前端使用 `npm run dev`，开放 Vite 开发端口 `5173`。

首次开发启动前建议确认：

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
mkdir -p data jldpath
```

启动后访问：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8000`
- 后端文档：`http://localhost:8000/docs`

如果本机 `5173` 已被占用，可改用其他端口，例如：

```bash
FRONTEND_DEV_PORT=5174 docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## 6. 数据入仓与刷新

仅启动服务并不会自动完成全量数据入仓，核心 ETL 入口是：

```bash
docker compose exec -T backend uv run python -m app.etl.load_data --base-dir / --mode rebuild
```

常用模式：

- `rebuild`：首次全量构建，清空并重建明细、路网映射和统计结果。
- `refresh`：复用已有明细，只重建路网映射与统计，日常更常用。
- `compute`：只刷新统计结果。
- `smoke`：轻量验证统计结果是否存在。

如果只是开发前端页面，已有数据库卷和统计数据时，可以直接复用现成数据库，不必每次重新跑 `rebuild`。

## 7. 关键接口与前端页面

后端稳定接口主要包括：

- `GET /healthz`
- `GET /api/v1/summary/daily`
- `GET /api/v1/chart/daily-trip-count`
- `GET /api/v1/chart/daily-vehicle-count`
- `GET /api/v1/chart/daily-distance`
- `GET /api/v1/chart/daily-distance-boxplot`
- `GET /api/v1/chart/daily-speed-boxplot`
- `GET /api/v1/map/heatmap`
- `GET /api/v1/map/heatmap/buckets`
- `GET /api/v1/route/capability`
- `POST /api/v1/route/compare`

前端主页面包含三块：

- 总览：KPI、趋势图、箱线图。
- 热力回放：按日期和时间桶查看道路热度。
- 路径对比：对比最短路与最快路，并支持地图选点。

## 8. 常用命令

```bash
# 开发模式启动
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# 停止服务
docker compose down

# 准备数据
make data-prepare

# 回归测试
make test
make test-backend
make test-frontend
```

## 9. 接手项目时最重要的几个注意点

- `scripts/start.sh` 默认不是严格意义上的开发模式，想要热更新请使用 `docker-compose.dev.yml`。
- 没有 `data/*.h5` 和 `jldpath/*.jld2` 时，后端虽然能启动，但统计和路径能力不会完整可用。
- Docker daemon 必须先启动，否则 `docker compose` 和 `start.sh` 都无法工作。
- 路径能力依赖 `pgRouting` 扩展和统计表初始化，排障时可优先看 `GET /api/v1/route/capability`。

## 10. 架构报告入口

如果你需要从课程汇报、系统设计或项目交接角度快速理解本仓库，建议继续阅读以下补充文档：

- [报告总览](./报告总览.md)
- [系统架构报告](./系统架构报告.md)
- [数据流与分层报告](./数据流与分层报告.md)
- [产品说明与业务场景](./产品说明与业务场景.md)
- [技术栈与部署架构](./技术栈与部署架构.md)

这些文档更适合用于：

- 课程作业答辩和书面报告整理
- 团队成员快速理解系统边界
- 从“数据中台四大能力”角度解释当前项目实现
