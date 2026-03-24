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

Route Compare 交互要点：

- 必须同时传 `start_time` 与 `query_time`。
- 地图支持 shortest/fastest 两条路线的显隐开关。
- 支持 `Clear Route Layers`，仅清除路线图层，不影响热力图回放。
- 支持 `Clear Route Result`，仅清空路线结果面板，不影响图层开关状态。
- 当 shortest/fastest 路径完全重合时，页面会提示“路径一致”。

## 6. 文档入口

- 主设计总纲：`../spec.md`
- 实施版总纲：`../implementation_guide.md`
- 运行上下文：`../project_context.md`
