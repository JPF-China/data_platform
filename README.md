# 哈尔滨车辆行程分析平台（V1）

本项目用于哈尔滨车辆轨迹数据分析，包含数据入仓、统计聚合、热力图回放与路径对比能力。

## 截图

![P1](frontend/src/assets/P1.png)
![P2](frontend/src/assets/P2.png)
![P3](frontend/src/assets/P3.png)

## 功能概览

- H5 + JLD2 数据入仓 PostgreSQL/PostGIS
- 每日统计指标、里程/速度箱线图
- 道路热力图分时回放
- 最短路径与最快路径对比

## 技术栈

- 后端：FastAPI、SQLAlchemy、PostgreSQL、PostGIS、pgRouting
- 前端：React、TypeScript、Vite、MapLibre GL、Recharts
- 数据流程：Python + ETL 脚本

## 新人启动手册（直接按下面做）

### 1) 前置条件

- 已安装 Docker（Docker Desktop 或 Docker Engine）
- 已安装 Git
- 已安装 `7z`（用于解压原始数据包）
- 能访问 Docker Hub（`registry-1.docker.io`），或已配置镜像加速器

macOS 安装 `7z`：

```bash
brew install p7zip
```

### 2) 拉代码

```bash
git clone https://github.com/your-org/data_platform.git
cd data_platform
```

### 3) 准备原始数据

默认主数据下载地址（Google Drive，ZIP；解压后目录为 `deepgtt-h5/`，包含 5 个 `*.h5`）：

`https://drive.usercontent.google.com/download?id=1tdgarnn28CM01o9hbeKLUiJ1o1lskrqA&export=download&authuser=0&confirm=t&uuid=2481bd7f-f21f-42a5-bb24-a8067a17356f&at=AGN2oQ3yy0IH0i35n6R_CZShxh3Y%3A1773114478451`

第二份数据下载地址（Google Drive，7z；解压后目录为 `jldpath/`，包含 5 个 `*.jld2`，你补全后替换）：

`xxx`

执行数据准备脚本（会下载、解压并把 `*.h5` 放到 `data/`、`*.jld2` 放到 `jldpath/`）：

```bash
make data-prepare
```

可通过环境变量覆盖下载地址：

```bash
DATA_ARCHIVE_URL_MAIN="<你的主数据zip链接>" \
DATA_ARCHIVE_URL_EXTRA="<你的补充数据7z链接>" \
make data-prepare
```

说明：

- 主数据压缩格式默认按 `zip` 处理（可通过 `DATA_ARCHIVE_FORMAT_MAIN` 覆盖）
- 补充数据压缩格式默认按 `7z` 处理（可通过 `DATA_ARCHIVE_FORMAT_EXTRA` 覆盖）
- 数据脚本会严格校验目录结构：必须有 `deepgtt-h5/` 与 `jldpath/`
- 数据脚本会清理旧的 `*.h5` / `*.jld2` 后再复制，避免混入历史文件
- 默认期望至少 5 个 `*.h5` 与 5 个 `*.jld2`（可用 `EXPECTED_H5_COUNT` / `EXPECTED_JLD2_COUNT` 覆盖）

### 4) 一键启动服务

```bash
./scripts/start.sh
```

若你已预拉取镜像且网络受限，可跳过 Docker Hub 可达性检查：

```bash
SKIP_REGISTRY_CHECK=1 ./scripts/start.sh
```

启动后访问：

- 前端：http://localhost:5173
- 后端：http://localhost:8000
- 接口文档：http://localhost:8000/docs

停止服务：

```bash
./scripts/stop.sh
```

## 手动启动（可选）

```bash
docker compose up -d
docker compose ps
docker compose down
```

## 入仓执行（可选）

```bash
cd backend
uv run python app/ingest/ingest_all.py
```

## 测试命令

```bash
make test
make test-backend
make test-frontend
make smoke
```

## 文档收口说明

为避免文档分散，日常使用优先看本 README：

- 启动、数据准备、排障、命令入口都在本文件。
- `QUICKSTART.md` 与 `DEPLOYMENT.md` 内容已并入本 README。

保留的专题文档：

- `spec.md`：架构原则与边界
- `implementation_guide.md`：实施总纲
- `project_context.md`：运行上下文
- `test_system.md`：测试体系
