# 前端（React + Vite）

## 1. 安装依赖

```bash
npm install
```

## 2. 启动开发服务

```bash
npm run dev
```

## 3. 构建

```bash
npm run build
```

## 4. 回归测试

```bash
npm run test
```

## 5. API 依赖

前端调用 `http://127.0.0.1:8000/api/v1`。
请先启动后端。

地图配置补充：

- 默认瓦片源通过 `VITE_MAP_TILES` 配置，默认值为 OSM。
- 若网络无法访问 OSM（底图空白），请在 `frontend/.env` 里改为可访问的瓦片地址。
- 支持逗号分隔多地址，例如：

```env
VITE_MAP_TILES=https://tile-a.example.com/{z}/{x}/{y}.png,https://tile-b.example.com/{z}/{x}/{y}.png
```

路径对比交互要点：

- 必须同时传 `start_time` 与 `query_time`。
- 地图支持 shortest/fastest 两条路线的显隐开关。
- 支持“清空路径图层”，仅清除路线图层，不影响热力图回放。
- 支持“清空路径结果”，仅清空路线结果面板，不影响图层开关状态。
- 当 shortest/fastest 路径完全重合时，页面会提示“路径一致”。
- Route 结果展示会使用 `route/compare` 的响应元信息（如 `query_bucket_start`、`nearest_*`、`route_*`、`snapped_*`）。

热力图模块交互要点：

- 提供热力图图例：畅通 / 繁忙 / 拥堵。
- 支持“清空热力图”：清空热力图图层，仅保留底图。
- 支持“恢复热力图”：恢复热力图图层展示。

工作台导航与主题：

- 左侧导航按分组组织（分析 / 运营 / 系统）。
- 总览内包含 KPI、趋势图与箱线图（不再单独提供箱线图导航）。
- 主题开关固定在左侧底部独立区域，默认浅色，支持浅色/深色。
- 左侧底部提供"大屏监控"入口，跳转到独立全屏仪表盘。

## 6. 大屏监控

独立全屏仪表盘（`/bigscreen.html`），适用于投屏展示：

- 顶部实时时钟 + 系统在线状态
- 4 张 KPI 卡片（总行程 / 总里程 / 活跃告警 / 严重疲劳）
- 左侧 MapLibre GL 实时地图（哈尔滨城区）
- 右侧风险实时监测 + 数据资产状态面板
- 每 30 秒自动刷新数据
- Vite 多页构建，独立入口

## 7. 设计规范

- 颜色令牌：统一使用 `index.css` 中 Tailwind `@theme` 定义（`--color-*` 变量），深色模式自动适配
- 排版：Work Sans（标题） + Inter（正文） + JetBrains Mono（数据）
- 间距体系：4px 基准网格
- 卡片：12px 圆角，`#ffffff` 背景，`1px #e8eaed` 边框

## 8. 文档入口

- 主设计总纲：`../spec.md`
- 实施版总纲：`../implementation_guide.md`
- 运行上下文：`../project_context.md`
