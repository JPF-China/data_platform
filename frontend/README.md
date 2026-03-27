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

- 左侧导航按分组组织（分析 / 路径）。
- 总览内包含 KPI、趋势图与箱线图（不再单独提供箱线图导航）。
- 主题开关固定在左侧底部独立区域，默认浅色，支持浅色/深色。

路径地图交互要点：

- 热力图子页面仅展示热力图与底图，不渲染路径线层和起终点标记。
- 路径子页面仅展示路线相关图层（shortest/fastest + 起终点）。
- 支持地图选点：选择起点 / 选择终点，点击地图自动回填经纬度。
- `route/compare` 响应包含吸附后的点位信息：`snapped_start_point` / `snapped_end_point`（包含吸附节点、坐标与距离）。
- 若出现“当前点位不支持/不可达”类错误，优先在 Route 地图重新选点。
- 后端已实现输入点自动吸附到最近路网节点（见 `backend/app/services/route_service.py` 与 `backend/app/services/route_search_service.py`）。

## 6. 文档入口

- 主设计总纲：`../spec.md`
- 实施版总纲：`../implementation_guide.md`
- 运行上下文：`../project_context.md`
