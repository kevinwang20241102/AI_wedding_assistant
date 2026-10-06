# Wedding Master（备备）

本项目由 SDD Harness 管理。身份、项目类型和规范选择见 `.sdd/project.json`。

- `docs/PRD.md`：需求、业务规则和验收标准。
- `docs/tech-spec.md`：技术方案、接口与数据约定。
- `.sdd/tasks.json`：任务和运行状态，由编排器维护。
- `docs/ui-style.md`：有界面时的设计风格。
- `docs/prototypes/`：可选界面设计。

## 页面功能导航

打开 [`docs/project-console.html`](docs/project-console.html)（浏览器直接打开即可）。左侧按实际页面/入口排列，右侧是可展开的功能卡片（触发、输入输出、带分支的前后端流程）；接口与算法按需展开。共享接口可跳转。这是实现导航，不是任务进度看板。

结构化数据在 [`docs/project-map.json`](docs/project-map.json)。页面优先读取同目录 JSON；`file://` 下若 fetch 失败，会使用 HTML 内嵌副本。

### 刷新方式

1. 按页面调用链核对源码后，更新 `docs/project-map.json`（页面、功能、接口字段、算法、来源路径与 `sha256` 指纹）。
2. 用浏览器打开或刷新 `docs/project-console.html`，或点「从同目录 JSON 重新加载」，或「选择 JSON 文件」。
3. 可机器提取的字段（路由、method、URL、请求响应字段）改 JSON 后重新打开即可。
4. 人工归纳的算法（建议截止日期、当前阶段、预算合计、排座满桌、备备生成管线、个人中心首字母）若对应源码指纹变了：必须先把该算法 `implementation_status` 标为「来源已变化待复核」，定向重读源码后再改回「源码已核对」并更新指纹。不能只改 `generated_at` / `checked_at`。
5. 隔离样例（不改仓库文件）：页面工具条上的「正常刷新 / 源码指纹变化 / 来源缺失 / 解析失败」。解析失败会提示并保留上一份导航，不会把过期算法标成已核对。
6. 参数默认值来自 `docs/tech-spec.md` 第七节与源码字面默认值，不要读取或猜测 `backend/.env` 当前值。刷新时不要调用 Deepseek 或短信，也不要停 5199 / 8099。

## 本地运行（设计默认端口）

配置字段与默认值见 `docs/tech-spec.md` 第七节和 `backend/.env.example` / `frontend/.env.example`。不要把真实密钥写入本 README。

- 后端：`cd backend`，把项目根加入 `PYTHONPATH` 后 `python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8099`
- 前端：`cd frontend && npm run dev -- --host 127.0.0.1 --port 5199`（代理 `/api` 到 `VITE_BACKEND_PROXY_TARGET`，示例为 `http://localhost:8099`）
