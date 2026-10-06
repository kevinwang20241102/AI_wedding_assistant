# Wedding Master 七层技术方案
status: Confirmed
specification: default

项目 ID：Wedding_Master。类型：web。依据已确认 PRD（REQ-001～REQ-016，AC-001～AC-087）及 2026-10-02 用户「全部按建议」：D-001-B、D-002-B、D-003-A、D-004-B。同日确认宾客不设备注字段，预算分类备注保留。未排座宾客可经 API-028 删除。同日确认 XiaoBei（REQ-012～REQ-016）。同日确认 D-005-B、D-006-A（用户原话「1）B」「2）A」）。记录见 `docs/decisions.md`。

REQ-001 至 REQ-017 的既有接口、数据和异常保留。本轮只补 REQ-018 个人中心（AC-099～AC-102）：复用 API-002 / API-005 的 `username`，首字母与浏览器本地日期由前端计算。不新增接口，不改已确认响应字段，不存头像。无待决体验取舍。2026-10-03 用户确认本轮方案，并确认默认头像为正圆、无边框、玫瑰粉底、白色字，可以开始绘制原型。同日确认退出登录先弹窗，点「确认」才调用 API-006，点「取消」不请求。见 AC-103。

---

## 一、用户要完成什么

引用 PRD「用户目标与完整流程」「需求与验收」「界面约定」。1.0 只做 PC 桌面浏览器，简体中文，必须登录。每个账号一个婚礼项目。计划书、预算本、座位表的数据互相独立，都挂在该项目下。XiaoBei 的对话挂在账号下，不挂在婚礼项目上。

数据链路：

1. 访客注册（REQ-001）或登录（REQ-002）→ 无项目则建项（REQ-004）→ 服务端按婚礼日写入 5 阶段共 41 条任务（REQ-005）。
2. 登录后默认备婚计划书（REQ-006）：展板最前显示婚礼日期，其后是倒计时、已完成、进行中。阶段按用户保存的顺序展示，不把当前阶段置顶。页面不单独列出今日待办或逾期任务。
3. 预算管理本只做预分配（REQ-007）：档案总预算为唯一总额来源，分类金额可超分。
4. 婚宴座位表：名单（REQ-008）与桌位排座（REQ-009）、画布总览（REQ-010）。
5. 左侧四个入口切换（REQ-011、REQ-012）：自上而下为新建对话、备婚计划书、预算管理本、婚宴座位表。模块间不自动同步。备备不能写入另外三个模块或婚礼档案。
6. 已有婚礼项目的用户可进入 XiaoBei（REQ-012～REQ-016）：发送文字或图片 → 后端只附带当前婚礼日期、城市、总预算、总人数 → Deepseek 流式返回最终回答 → 对话持久化到账号，换电脑仍在。
7. 功能页展开的侧栏在历史区域与「编辑婚礼档案」之间展示个人中心（REQ-018）：圆形首字母、注册用户名、浏览器本地当天日期。数据来自登录态 `UserSession.username`，不读新郎/新娘昵称，不请求新接口。

页面入口：登录、注册、找回密码、创建婚礼项目、备婚计划书、预算管理本、婚宴座位表、XiaoBei（`/xiaobei`，原型待界面设计）。功能页提供退出登录；点击后先确认，确认才调用 API-006。未登录不能进四个模块；已登录无项目只能走建项，不能进 XiaoBei。登录、注册、找回密码、创建婚礼项目不展示个人中心。

前端不直连 Deepseek、不持有密钥。外部依赖：找回密码短信（EXT-001）；XiaoBei 对话（EXT-002 Deepseek Chat Completions）。二者开发默认 Mock，缺密钥不阻塞其余模块。

主路径技术时序与 PRD「流程图与时序图」一致，XiaoBei 时序以本方案 API-029～API-042 与 EXT-002 为准。字段以本节及第三节为准。
---

## 二、前后端怎么分工，接口怎么拆

### 分工与栈

| 侧 | 职责 | 选型（default 规范） |
| --- | --- | --- |
| 前端 | PC SPA：路由与登录态、四个模块 UI、拖拽/缩放、乐观更新、XiaoBei 流式与侧栏历史、个人中心首字母 | React + TypeScript + Vite + React Router；Axios 单例（JSON，超时 10s）；生成与跨页事件用 `fetch` / `EventSource`（不走 10s Axios）；状态用 Hooks / Context；个人中心拼音用 `pinyin-pro` |
| 后端 | 鉴权、唯一婚礼项目、模板生成、业务校验、持久化、短信适配、XiaoBei 对话与 Deepseek 代理 | Python 3.11+、FastAPI、pycore、SQLAlchemy asyncio、SQLite（aiosqlite）、bcrypt、PyJWT；Deepseek 用 `httpx.AsyncClient(trust_env=False)`，不用官方 SDK |
| 外部 | 找回密码短信；XiaoBei 对话 | EXT-001 阿里云号码认证 `SendSmsVerifyCode`；EXT-002 Deepseek `POST /chat/completions`。二者开发默认 Mock |

前端开发端口 5199，后端 8099；用户门禁前端 5175、后端 8003。`VITE_API_BASE_URL=/api`，Vite 代理到后端。浏览器 Cookie 同源，不把后端绝对 URL 写进前端。

统一 JSON 信封（pycore `APIResponse`）：`success`、`data`、`error`、`error_code`、`message`、`timestamp`、`request_id`、`metadata`。业务字段只在 `data`。HTTP 状态与 `success` / `error_code` 一致。字段名 snake_case，前后端不转驼峰。

鉴权：登录/注册成功后设置 HttpOnly Cookie `access_token`（JWT HS256）。`remember=true` 时 Cookie `Max-Age=2592000`（30 天）且 JWT `exp` 30 天；未勾选时为会话 Cookie（关浏览器失效），JWT `exp` 12 小时兜底。`SameSite=Lax`，`Path=/`。受保护路由用 `Depends(get_current_user)` 读 Cookie，不用全局 Auth 中间件。同一账号多浏览器同时有效（AC-006）。密码重置成功后递增 `credential_version`，旧 JWT 全部失效。

前端 Axios：`withCredentials: true`，超时 10s；401 时清认证 Context 并进登录页。不把 Token 写入 `localStorage`（否则无法实现「未勾选则随会话结束」）。XiaoBei 生成流（API-035、API-036、API-038、API-039、API-040）和跨页事件（API-042）不走该 10s 超时。API-037 停止为短 JSON。

幂等：注册、建项、发验证码、首次发消息非幂等；改档、改任务、排座、对话重命名采用最后写入为准。短信发送不自动重试。同一段对话同一时刻只允许一条助手回复处于 `generating`；重复发送返回 409。

资源词（与 PRD 名词、路由文件一致）：`users`、`weddings`、`tasks`、`budget_categories`、`guest_groups`、`guests`、`tables`、`conversations`（XiaoBei 对话）、`conversation_images`（对话图片）、`wedding_photos`（婚礼档案照片）。

### 接口索引

| 编号 | Method / URL | 关联 |
| --- | --- | --- |
| API-001 | POST /api/users | REQ-001 AC-001 AC-002 AC-043；REQ-018 用户名须能注册 AC-099～AC-102 示例 |
| API-002 | POST /api/users/login | REQ-002 AC-003～AC-006；REQ-018 AC-099～AC-102（返回 `username`） |
| API-003 | POST /api/users/password-reset/send-code | REQ-003 AC-007 AC-008 |
| API-004 | POST /api/users/password-reset/confirm | REQ-003 AC-007 AC-008 |
| API-005 | GET /api/users/me | REQ-002 AC-003 AC-004 AC-006；落地路由；REQ-018 AC-099～AC-102（只读 `username`） |
| API-006 | POST /api/users/logout | REQ-002 AC-044 |
| API-007 | POST /api/weddings | REQ-004 AC-009 AC-010；REQ-005 AC-012 |
| API-008 | GET /api/weddings/current | REQ-004；REQ-006；REQ-007 AC-019 AC-024；REQ-010 AC-037 AC-038 |
| API-009 | PATCH /api/weddings/current | REQ-004 AC-011 AC-041；REQ-007 AC-024；REQ-010 AC-037 |
| API-010 | GET /api/tasks | REQ-005 AC-012 AC-015；REQ-006 AC-016 AC-017 AC-018 |
| API-011 | POST /api/tasks | REQ-005 AC-013 |
| API-012 | PATCH /api/tasks/{task_id} | REQ-005 AC-013 AC-014；REQ-004 AC-041 |
| API-013 | DELETE /api/tasks/{task_id} | REQ-005 AC-013 |
| API-014 | GET /api/budget_categories | REQ-007 AC-019～AC-021 AC-023 AC-025 |
| API-015 | POST /api/budget_categories | REQ-007 AC-022 |
| API-016 | PATCH /api/budget_categories/{category_id} | REQ-007 AC-020 AC-022 |
| API-017 | DELETE /api/budget_categories/{category_id} | REQ-007 AC-022 |
| API-018 | GET /api/guest_groups | REQ-008 AC-027 AC-028 |
| API-019 | POST /api/guest_groups | REQ-008 AC-028 |
| API-020 | GET /api/guests | REQ-008 AC-026；REQ-010 AC-038 |
| API-021 | POST /api/guests | REQ-008 AC-026 |
| API-022 | POST /api/guests/paste | REQ-008 AC-027 AC-029 |
| API-023 | PATCH /api/guests/{guest_id} | REQ-008 AC-028；REQ-009 AC-031 AC-032 AC-034 |
| API-024 | GET /api/tables | REQ-009 AC-030 AC-036；REQ-010 |
| API-025 | POST /api/tables | REQ-009 AC-030 |
| API-026 | PATCH /api/tables/{table_id} | REQ-009 AC-030 AC-036；REQ-010 AC-037 |
| API-027 | DELETE /api/tables/{table_id} | REQ-009 AC-030 AC-042 |
| API-028 | DELETE /api/guests/{guest_id} | REQ-008 AC-047 |
| API-029 | GET /api/conversations | REQ-012 AC-050 AC-052 AC-053；REQ-013 AC-054 AC-055 AC-058 |
| API-030 | GET /api/conversations/{conversation_id} | REQ-012 AC-052；REQ-013 AC-057 AC-060；REQ-014 AC-065 AC-067；REQ-015 AC-071 AC-073 |
| API-031 | PATCH /api/conversations/{conversation_id} | REQ-013 AC-055；REQ-014 AC-067 |
| API-032 | DELETE /api/conversations/{conversation_id} | REQ-013 AC-056 |
| API-033 | POST /api/conversation_images | REQ-014 AC-062 |
| API-034 | GET /api/conversation_images/{image_id} | REQ-013 AC-058；REQ-014 AC-062 |
| API-035 | POST /api/conversations | REQ-013 AC-054；REQ-014 AC-061～AC-067 AC-087；REQ-015 AC-068；REQ-016 AC-074～AC-086 |
| API-036 | POST /api/conversations/{conversation_id}/messages | REQ-014 AC-061～AC-067 AC-087；REQ-016 AC-074～AC-086 |
| API-037 | POST /api/conversations/{conversation_id}/messages/{message_id}/stop | REQ-014 AC-064 |
| API-038 | POST /api/conversations/{conversation_id}/messages/{message_id}/retry | REQ-016 AC-084 AC-085 AC-086 |
| API-039 | POST /api/conversations/{conversation_id}/messages/{message_id}/regenerate | REQ-014 AC-065 |
| API-040 | PATCH /api/conversations/{conversation_id}/messages/{message_id} | REQ-014 AC-065 |
| API-041 | PATCH /api/conversations/{conversation_id}/messages/{message_id}/feedback | REQ-014 AC-065 |
| API-042 | GET /api/conversations/events | REQ-013 AC-059 |
| API-043 | GET /api/wedding_photos | REQ-017 AC-090 AC-091 AC-095 |
| API-044 | POST /api/wedding_photos | REQ-017 AC-091 AC-092 AC-093 |
| API-045 | GET /api/wedding_photos/{photo_id} | REQ-017 AC-091 |
| API-046 | DELETE /api/wedding_photos/{photo_id} | REQ-017 AC-094 |
| API-047 | PUT /api/wedding_photos/{photo_id} | REQ-017 AC-093 AC-094 |
| EXT-001 | POST 阿里云号码认证 SendSmsVerifyCode | REQ-003 |
| EXT-002 | POST Deepseek /chat/completions | REQ-014 REQ-016；由 API-035、API-036、API-038、API-039、API-040 调用 |

无需后端接口、由前端或缺位验收：AC-018（无推送）、AC-023 点击扇区（前端跳转分类详情）、AC-025 / AC-029 / AC-033 / AC-039（不提供记账、文件导入、长按选桌、打印导出）、AC-040（模块隔离）、AC-050 登录后第一屏与侧栏顺序（路由默认 `/plan`，侧栏四项）、AC-051 无项目不能进 XiaoBei（`RequireWedding`）、AC-053 历史区域滚动与折叠（侧栏布局）、AC-057 对话页不提供删单条/清空/分享/导出/打印、AC-061 Enter/Shift+Enter 与空白不可点、AC-062 非图片文件前端直接忽略、AC-065 复制、AC-068～AC-072 问候/免责声明/气泡布局、AC-073 滚动位置（前端）、AC-096（档案抽屉，前端）、AC-099～AC-102（个人中心排版、不可点击、折叠显隐、首字母与本地日期；用户名仍来自 API-002 / API-005）。不新增头像上传、资料页或改用户名接口。

未登录访问 API-005 及之后除找回密码外的接口：401 `UNAUTHORIZED`。无婚礼项目调用项目内资源及全部 XiaoBei 接口：409 `CONFLICT`（需先建项）。API-042 的静态路径 `/events` 必须注册在 `/{conversation_id}` 之前。

---

### API-001 注册账号

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-001 AC-001 AC-002 AC-043；REQ-018 AC-099～AC-102（用户名字符集须能注册示例名） |
| Method / URL | POST /api/users |
| 请求 | `application/json`：`username` string 必填（规则见第三节，须能注册 AC-099～AC-102 的示例名）；`password` string 必填；`phone` string 必填 |
| 成功响应 | 201，`data` 为 `UserSession`；`Set-Cookie: access_token`（会话 Cookie，注册后立即建项） |
| 失败响应 | 400 `VALIDATION_ERROR`；409 `CONFLICT`（用户名已存在，或手机号已存在） |

成功示例：

```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "alice",
    "phone": "13800138000",
    "has_wedding": false
  },
  "error": null,
  "error_code": null,
  "message": "注册成功"
}
```

失败示例（密码不合规）：HTTP 400，`error_code=VALIDATION_ERROR`，`error` 为明确中文原因（少位数 / 缺大写 / 缺小写 / 缺数字 / 未填手机号）。

失败示例（手机号已注册）：HTTP 409，`error_code=CONFLICT`，`error` 说明该手机号已被注册。AC-043。

---

### API-002 登录

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-002 AC-003 AC-004 AC-005 AC-006 AC-044 AC-045 AC-046；REQ-018 AC-099～AC-102 |
| Method / URL | POST /api/users/login |
| 请求 | `username` string 必填；`password` string 必填；`remember` boolean 必填 |
| 成功响应 | 200，`data` 为 `UserSession`；Set-Cookie 见本节开头 |
| 失败响应 | 401 `UNAUTHORIZED`（用户名或密码错误，文案不区分哪一项）；400 校验失败 |

成功后前端：`has_wedding=true` 进计划书，否则进建项。不提供验证码登录。登录页显示或隐藏密码只在浏览器内切换输入框类型，不新增接口，请求里的 `password` 仍是用户输入的同一串字符（AC-045、AC-046）。`data.username` 即个人中心展示名，前端写入认证 Context，功能页不再为个人中心另发请求。

---

### API-003 发送找回密码验证码

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-003 AC-007 AC-008 |
| Method / URL | POST /api/users/password-reset/send-code |
| 请求 | `phone` string 必填 |
| 成功响应 | 200，`data`: `{ "expires_in_seconds": 300, "resend_after_seconds": 60 }`。不返回验证码 |
| 失败响应 | 400 手机号格式错误或发送过频；404 手机号未注册（文案：「该手机号未注册」）；500 短信通道失败 |

无论 Mock 或阿里云，成功响应形状相同。Mock 只写服务端日志，响应与页面都不返回验证码。`sms_mode=aliyun` 且未配置密钥时本接口返回 500，不影响注册、登录和四个模块。

---

### API-004 确认重置密码

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-003 AC-007 AC-008 |
| Method / URL | POST /api/users/password-reset/confirm |
| 请求 | `phone` string；`code` string；`new_password` string |
| 成功响应 | 200，`data`: `{ "ok": true }`。不自动登录。旧密码立即不可用 |
| 失败响应 | 400 验证码错误/过期或新密码不合规；密码不变 |

---

### API-005 恢复登录态

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-002 AC-003 AC-004 AC-006；REQ-018 AC-099 AC-100 AC-101 AC-102 |
| Method / URL | GET /api/users/me |
| 请求 | 无 body；带 Cookie |
| 成功响应 | 200，`UserSession`（字段与 API-001 成功示例相同：`id`、`username`、`phone`、`has_wedding`）。不增加 `avatar_url`、`avatar_initial`、头像文件或新郎/新娘昵称 |
| 失败响应 | 401 无 Cookie 或 JWT 无效/过期/`credential_version` 不匹配 |

刷新功能页时用本接口恢复认证 Context，个人中心读取其中的 `username`。刚登录后可直接使用 API-002 的 `UserSession`，不必为展示个人中心再打一次本接口。失败 401 时进登录页，登录页不展示个人中心。

---

### API-006 退出登录

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-002 AC-044 |
| Method / URL | POST /api/users/logout |
| 请求 | 无 body；可带 Cookie |
| 成功响应 | 200，`data`: `{ "ok": true }`；`Set-Cookie` 将 `access_token` 过期清除（`Max-Age=0`） |
| 失败响应 | 无业务失败。无 Cookie 时仍 200 并确保 Cookie 被清除 |

用户点「确认」后前端才请求本接口。点「取消」不请求，登录态不变，仍停在当前功能页。前端收到 200 后清除认证 Context，进入登录页。再访问计划书走未登录分支。本端退出不影响其他浏览器中的登录（AC-006）。

---

### API-007 创建唯一婚礼项目

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-004 AC-009 AC-010；REQ-005 AC-012 |
| Method / URL | POST /api/weddings |
| 请求 | `start_date` date 必填；`wedding_date` date 必填；`city` string 必填；`total_budget_fen` int 必填 ≥0；`guest_estimate` int 必填 ≥0 |
| 成功响应 | 201，`data` 为 `WeddingPublic`（含刚生成的画布默认值） |
| 失败响应 | 400 缺字段、日期非法、`wedding_date` 早于 `start_date`；409 该账号已有项目 |

同一事务写入：婚礼行、41 条任务（状态「未开始」，截止日期按阶段窗口结束日）、17 个预算分类（金额 0、状态「未确定」，顺序为婚礼场地费、婚宴餐费、策划设计费、四大-摄影师费、四大-摄像师费、四大-主持人费、四大-化妆师费、甜品台费、现场布置费、新娘婚纱费、新娘婚鞋费、新郎西服费、新郎皮鞋费、宾客伴手礼费、宾客邀请函费、烟/酒/茶/喜糖费、宾客住宿费）、8 个预置宾客分组（新郎、新娘、男方亲属、女方亲属、男方朋友、女方朋友、男方同事、女方同事）。总人数不写入座位表。

---

### API-008 读取当前婚礼档案

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-004；REQ-007 AC-019 AC-024；REQ-010 AC-037 AC-038 |
| Method / URL | GET /api/weddings/current |
| 请求 | 无 |
| 成功响应 | 200，`WeddingPublic` + `seating_stats` |
| 失败响应 | 404 尚无项目 |

`seating_stats`：`guest_total`、`confirmed_count`（出席=已确认）、`seated_count`、`unseated_count`。满足 AC-038：已排座+未排座=总数。

---

### API-009 更新档案或画布视图

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-004 AC-011 AC-041；REQ-007 AC-024；REQ-010 AC-037 |
| Method / URL | PATCH /api/weddings/current |
| 请求 | 任意子集：`start_date`、`wedding_date`、`city`、`total_budget_fen`、`guest_estimate`、`groom_nickname`、`groom_birthday`、`bride_nickname`、`bride_birthday`、`other_preference`、`canvas_scale`、`canvas_offset_x`、`canvas_offset_y` |
| 成功响应 | 200，最新 `WeddingPublic` |
| 失败响应 | 400 校验失败；404 无项目 |

改 `total_budget_fen` 不改各分类金额。改 `guest_estimate` 不改宾客名单。改 `wedding_date` 时：倒计时和当前阶段用新日期；`due_date_customized=false` 的任务按新婚礼日重算建议截止日期；`due_date_customized=true` 的任务截止日期不变。AC-041。本接口不接收、不删除婚礼档案照片。`groom_nickname`、`bride_nickname` 为可空字符串。`groom_birthday`、`bride_birthday` 为可空日期；空值表示未填，日期非法返回 400，原值保留。创建项目的 API-007 不接收这四项。XiaoBei 不读取这四项。AC-097。`other_preference` 为可空文本，空字符串表示未填，保留换行。创建项目的 API-007 不接收它。XiaoBei 不读取它。AC-098。

---

### API-043 至 API-047 婚礼档案照片

照片只属于当前账号的唯一婚礼项目。创建项目的 API-007 不接收照片。XiaoBei 不读取这些照片。计划书、预算和座位接口的响应里不带照片。

| 编号 | Method / URL | 关联 | 成功 | 失败 |
| --- | --- | --- | --- | --- |
| API-043 | GET /api/wedding_photos | AC-090 AC-091 AC-095 | 200，`data` 为按上传顺序排列的 `{ "id", "url" }[]`。`url` 指向 API-045。没有照片时为空数组 | 401；409 无项目 |
| API-044 | POST /api/wedding_photos | AC-091 AC-092 AC-093 | 201，新照片 `{ "id", "url" }` | 400 不是 JPEG/PNG/GIF/WebP，或超过 5242880 字节；409 已有 1 张 |
| API-045 | GET /api/wedding_photos/{photo_id} | AC-091 | 200，图片字节 | 404 不是本项目的照片 |
| API-046 | DELETE /api/wedding_photos/{photo_id} | AC-094 | 200，`{ "ok": true }`。只删除这一张 | 404 |
| API-047 | PUT /api/wedding_photos/{photo_id} | AC-093 AC-094 | 200，同一 `id` 的新字节 | 400 格式或大小不符，原图保留；404 |

POST 与 PUT 均为 `multipart/form-data` 字段 `file`。以文件头识别 JPEG / PNG / GIF / WebP，不信任扩展名。单张不超过 5242880 字节。每个婚礼项目最多 1 张。已有这一张时，更换走 API-047，不再 POST 第二张。文件落在 `backend/data/wedding_photos/`。删除项目数据时一并删除这些文件；1.0 没有单独的注销入口，因此没有另一条清理路径。

---

### API-010 计划书聚合读取

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-005 AC-012 AC-015；REQ-006 AC-016 AC-017 AC-018 |
| Method / URL | GET /api/tasks |
| 请求 | 无 |
| 成功响应 | 200，见下 |
| 失败响应 | 404 / 409 无项目 |

`data`：

- `wedding_date` date：档案中的婚礼日。计划书展板最前与倒计时同一套排版，标签「婚礼日期」，数字为「年/月/日」，月和日不补零
- `countdown_days` int：`wedding_date - 今天`（上海日历日；婚礼日后为负）
- `progress`: `{ "completed": int, "in_progress": int, "total": int }` 分母为现存任务数；`completed` 为「已完成」，`in_progress` 为「进行中」
- `current_stage`: 默认五个阶段 id 之一，或 `null`（婚礼日已过，或命中的阶段已被删除）。只用于决定哪一组默认展开，不参与排序
- `stages`: `StagePublic[]`，按 `sort_order` 排列。每项含 `id`、`name`（【】内的名称）、`sort_order`。展示序号由前端按数组下标写成 `STAGE-01` 起，不入库
- `tasks`: 全部 `TaskPublic[]`，按阶段内 `sort_order` 排列（供折叠列表）。不另返回今日待办或逾期任务列表

无邮件/短信/浏览器推送字段。

---

### API-011 新增任务

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-005 AC-013 |
| Method / URL | POST /api/tasks |
| 请求 | `name` string 必填；`stage_id` 为本项目某个阶段的 id，必填；`due_date` date 必填 |
| 成功响应 | 201，`TaskPublic`（`status` 默认「未开始」，`due_date_customized=true`）。`stage_id` 为用户所点的那个阶段，新任务排在该阶段最前 |
| 失败响应 | 400 |

---

### API-012 修改任务

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-005 AC-013 AC-014；REQ-004 AC-041 |
| Method / URL | PATCH /api/tasks/{task_id} |
| 请求 | 任意子集：`name`、`stage_id`、`due_date`、`status`（未开始/进行中/已完成/已超期）、`sort_order` |
| 成功响应 | 200，`TaskPublic` |
| 失败响应 | 400；404 非本账号任务 |

长按超过 0.5 秒后拖动任务（AC-048）时，请求带上新的 `stage_id` 和 `sort_order`。`sort_order` 是目标阶段内的插入下标，从 0 起；该阶段其余任务顺延。这次请求不改 `due_date`、`status`、`due_date_customized`。未满 0.5 秒松手不发请求。

用户提交 `due_date` 时将 `due_date_customized` 置为 true，之后改婚礼日不再重算该条。AC-041。

---

### API-013 删除任务

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-005 AC-013 |
| Method / URL | DELETE /api/tasks/{task_id} |
| 请求 | 无 |
| 成功响应 | 200，`{ "ok": true }` |
| 失败响应 | 404 |

进度分母随现存任务减少。前端先弹出「您是否确认删除？」，确认后才调用本接口；取消不请求。

---

### API-014 预算分类列表

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-007 AC-019 AC-020 AC-021 AC-023 AC-025 |
| Method / URL | GET /api/budget_categories |
| 请求 | 无 |
| 成功响应 | 200，`{ "total_budget_fen": int, "allocated_fen": int, "unallocated_fen": int, "is_over_allocated": bool, "categories": BudgetCategoryPublic[] }` |
| 失败响应 | 404 无项目 |

无支出/付款字段。`unallocated_fen` 可为负。页面不展示环形图。总预算占比由前端用该类 `amount_fen / total_budget_fen` 计算，保留两位小数；`total_budget_fen=0` 时显示 0.00%。

---

### API-015 / API-016 / API-017 预算分类增改删

- POST /api/budget_categories：`name` 必填，`amount_fen` 默认 0，`status` 默认「未确定」，`note` 可空。201 `BudgetCategoryPublic`。
- PATCH /api/budget_categories/{category_id}：可改 `name`、`amount_fen`、`status`（未确定/已确定/已支付）、`note`、`sort_order`。改一分类不影响其他分类金额。允许 `amount_fen` 使合计超过总预算。长按超过 0.5 秒后拖动分类时，只更新 `sort_order` 为新的列表下标，从 0 起，其余分类顺延；不改名称、金额、状态和备注。未满 0.5 秒松手不发请求。
- DELETE：预置与自定义均可删；200。404 若 id 不属于本项目。

关联 REQ-007 AC-020 AC-022。

---

### API-018 / API-019 宾客分组

- GET /api/guest_groups：200，`GuestGroupPublic[]`（含预置与自定义）。
- POST /api/guest_groups：`name` 必填，同一项目内重名 409。1.0 不提供改名/删除分组接口（PRD 无对应 AC）。

关联 REQ-008 AC-027 AC-028。

---

### API-020 宾客列表

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-008 AC-026；REQ-010 AC-038 |
| Method / URL | GET /api/guests |
| 请求 | 无（搜索/筛选在前端做，1.0 名单规模为单人婚礼） |
| 成功响应 | 200，`{ "seating_stats": SeatingStats, "guests": GuestPublic[] }` |

`table_id` 为 null 表示未排座。

---

### API-021 逐条添加宾客

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-008 AC-026 |
| Method / URL | POST /api/guests |
| 请求 | `name` 必填；`group_id` 可空（空则「新郎」）；`seq` 可空，空或非数字则为 0；`note` 可空，添加弹窗不填备注 |
| 成功响应 | 201，`GuestPublic`（`attendance` 默认「待定」，`seq` 默认 0，`table_id` null） |
| 失败响应 | 400；404 分组不存在 |

---

### API-022 批量粘贴宾客

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-008 AC-027 AC-029 |
| Method / URL | POST /api/guests/paste |
| 请求 | `text` string 必填 |
| 成功响应 | 201，`{ "created_count": int, "guests": GuestPublic[] }` |
| 失败响应 | 400 文本为空或全是空行 |

无文件上传字段。解析规则见 §五。只有姓名 → 分组「新郎」。

---

### API-023 改宾客或排座

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-008 AC-028；REQ-009 AC-031 AC-032 AC-034 |
| Method / URL | PATCH /api/guests/{guest_id} |
| 请求 | 任意子集：`name`、`group_id`、`attendance`（待定/已确认/已婉拒）、`seq`（整数，空则为 0）、`table_id`（int 入座，`null` 回池）。全部宾客名单里改姓名、分组、出席或宾客序号走此接口 |
| 成功响应 | 200，`{ "guest": GuestPublic, "seating_stats": SeatingStats, "table": TablePublic \| null }`（入座/离座时带目标桌最新 `seated_count`） |
| 失败响应 | 400；404 |

桌已满仍 200，不拒绝。删除宾客走 API-028，不再用「已婉拒」代替删除。

---

### API-024 / API-025 / API-026 桌位

- GET /api/tables：主桌在前，其余按 `table_number` 升序。含 `seated_count`、`is_head`、`pos_x`、`pos_y`。
- POST /api/tables：无必填。`table_number = max(已有)+1`（从 1 起），默认名「第 N 桌」，`capacity=10`，`is_head=false`，坐标由前端给初始值或 0。
- PATCH /api/tables/{table_id}：`name`、`capacity`（≥1）、`is_head`、`pos_x`、`pos_y`。将一张桌 `is_head=true` 时，同项目其他桌 `is_head=false`。`capacity` 小于已坐人数仍允许，不自动移人。

关联 REQ-009 AC-030 AC-036；REQ-010 AC-037。

---

### API-027 删桌

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-009 AC-030 AC-042 |
| Method / URL | DELETE /api/tables/{table_id} |
| 成功响应 | 200，`{ "ok": true, "seating_stats": SeatingStats }` |
| 失败响应 | 404 |

删除该桌。该桌宾客 `table_id` 置为 null，回到未排座池；名单保留，宾客总数不变。AC-042。

---

### API-028 删除宾客

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-008 AC-047 |
| Method / URL | DELETE /api/guests/{guest_id} |
| 成功响应 | 200，`{ "ok": true, "seating_stats": SeatingStats }` |
| 失败响应 | 404 |

只删除这一名宾客。若其已入座，同时从该桌移除，该桌 `seated_count` 减 1。宾客总数减 1。不删除分组。AC-047。

---

### XiaoBei 共用类型（API-029～API-042）

`ConversationPublic`：`id` int；`title` string；`title_customized` bool；`model_id` string（仅 `deepseek-flash` 或 `deepseek-v4-pro`）；`created_at`、`updated_at`、`last_message_at` ISO-8601（上海时区偏移）。

`MessageImagePublic`：`id` int；`url` string（相对路径 `/api/conversation_images/{id}`）。

`MessagePublic`：`id` int；`conversation_id` int；`role` `user` | `assistant`；`status` `complete` | `generating` | `failed` | `stopped`；`error_kind` `timeout` | `rate_limited` | `other` | null；`content` string（助手为最终回答 Markdown，不含思考过程）；`earlier_unused` bool；`module_link` `plan` | `budget` | `seating` | null；`feedback` `like` | `dislike` | `none`；`images` `MessageImagePublic[]`；`model_id` string | null（本轮实际调用的模型，用户消息为 null）；`created_at` ISO-8601。

生成类接口成功时为 `text/event-stream`（SSE），不走 JSON 信封。事件名为 `accepted`、`delta`、`done`、`failed`、`stopped`。每个 `data` 行为 JSON。请求在打开流之前失败时仍返回 JSON 信封。

SSE 事件：

| event | data |
| --- | --- |
| accepted | `{ conversation: ConversationPublic, user_message: MessagePublic, assistant_message: MessagePublic }` |
| delta | `{ conversation_id, message_id, text }`，`text` 仅为最终回答增量，不含 `reasoning_content` |
| done | `{ conversation_id, message_id, earlier_unused, module_link, content }` |
| failed | `{ conversation_id, message_id, error_kind }`，`error_kind` 为 `timeout` / `rate_limited` / `other` |
| stopped | `{ conversation_id, message_id, kept: bool, content }` |

前端文案：`timeout` → 「对不起，本次回答超时了，请您重试。」；`rate_limited` → 「对不起，当前暂时无法回答，请稍后重试。」；`other` → 「对不起，这次没有得到回答，请您重试。」均附「重试」。页面无购买入口、无密钥入口。

---

### API-029 对话列表

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-012 AC-050 AC-052 AC-053；REQ-013 AC-054 AC-055 AC-058 |
| Method / URL | GET /api/conversations |
| 请求 | 无 body；Cookie 鉴权 |
| 成功响应 | 200，`data` 为 `ConversationPublic[]`，按 `last_message_at` 降序。未发送过消息的对话不入库，故不出现 |
| 失败响应 | 401；409 无婚礼项目 |

计划书、预算本、座位表、档案页的侧栏历史都调本接口。点击列表项进 `/xiaobei?c={id}`。

成功示例：

```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "title": "婚期怎么定",
      "title_customized": false,
      "model_id": "deepseek-flash",
      "created_at": "2026-10-02T16:00:00+08:00",
      "updated_at": "2026-10-02T16:01:00+08:00",
      "last_message_at": "2026-10-02T16:01:00+08:00"
    }
  ]
}
```

---

### API-030 读取一段对话

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-012 AC-052；REQ-013 AC-057 AC-060；REQ-014 AC-065 AC-067；REQ-015 AC-071 AC-073 |
| Method / URL | GET /api/conversations/{conversation_id} |
| 请求 | 无 |
| 成功响应 | 200，`data`: `{ "conversation": ConversationPublic, "messages": MessagePublic[] }`，消息按 `id` 升序，含该段全部消息 |
| 失败响应 | 401；404 非本账号；409 无项目 |

空白新对话不调本接口（无 id）。点侧栏「新建对话」进入空白新对话，不自动打开列表第一条。打开某一段：该段 `id`。

---

### API-031 重命名或更换本段模型

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-013 AC-055；REQ-014 AC-067 |
| Method / URL | PATCH /api/conversations/{conversation_id} |
| 请求 | 任意子集：`title` string（非空，去首尾空白后 1～200 个字符）；`model_id` 仅允许配置白名单中的 Deepseek 模型 id |
| 成功响应 | 200，最新 `ConversationPublic`。提交 `title` 时 `title_customized=true` |
| 失败响应 | 400；401；404；409 |

更换 `model_id` 只影响之后的发送、重试、重新生成、重新发送，不改写已有回复。新对话在前端本地使用默认模型，首次发送把当时选中的模型写入 API-035。

---

### API-032 删除整段对话

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-013 AC-056 |
| Method / URL | DELETE /api/conversations/{conversation_id} |
| 请求 | 无 |
| 成功响应 | 200，`{ "ok": true }`。级联删除该段消息与仅被该段引用的图片文件 |
| 失败响应 | 401；404；409 |

前端先弹出「您是否确认删除？」；取消不请求。若该段仍在生成，删除同时取消生成任务。

---

### API-033 上传对话图片

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-014 AC-062 |
| Method / URL | POST /api/conversation_images |
| 请求 | `multipart/form-data` 字段 `file`。单张不超过 `5242880` 字节（5×1024×1024）。以文件头识别 JPEG / PNG / GIF / WebP，不信任扩展名或声明的 MIME |
| 成功响应 | 201，`MessageImagePublic` |
| 失败响应 | 400 超过 5MB（`error` 为「您上传的图片超过5M，请压缩后再发送。」）；400 无法识别（`error` 为「您上传的图片无法识别，请换一张再发送。」）；401；409；413 仅当中间件先于业务校验截断时，前端仍展示超 5MB 原文 |

从「上传图片」选择的视频、录音和其他非图片：前端不调用本接口，页面无提示。本接口若收到非四类图片，按无法识别处理，不另造文案。「上传文件」只在浏览器读取扩展名为 .md 的文本，把抽出的文字并入本轮 `text`，不把文件交给 Deepseek。PDF、Word、Excel、PPT 和其他格式不读取，前端显示「只能上传 md 格式的文件。」空的 Markdown 显示「这份 Markdown 没有可发送的文字。」并入后的 `text` 仍受 4000 个码点限制。

成功示例：HTTP 201，`data`: `{ "id": 12, "url": "/api/conversation_images/12" }`。

---

### API-034 读取对话图片

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-013 AC-058；REQ-014 AC-062 |
| Method / URL | GET /api/conversation_images/{image_id} |
| 请求 | 无 body；Cookie 鉴权 |
| 成功响应 | 200，`Content-Type` 为实际图片类型，body 为文件字节。非 JSON 信封 |
| 失败响应 | 401 JSON；404 JSON；409 JSON |

仅本账号上传的图片可读取。换电脑登录后仍可用原 `url`。

---

### API-035 新开一段并发送第一条

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-013 AC-054；REQ-014 AC-061～AC-067 AC-087；REQ-015 AC-068；REQ-016 AC-074～AC-086 |
| Method / URL | POST /api/conversations |
| 请求 | `application/json`：`text` string 可空；`image_ids` int[] 可空，默认 `[]`；`model_id` 可空（空则默认 `deepseek-flash`）。`text` 去首尾空白后与 `image_ids` 不能同时为空。`text` 长度（Unicode 码点）≤ 4000。`image_ids` 必须属于本账号且尚未挂到其他消息 |
| 成功响应 | 200，`text/event-stream`，先 `accepted`（此时列表应出现本段，`title` 为第一条用户可见文字全文，不按 200 个字符截断；仅图片时标题为「图片」），随后 `delta`…，最后 `done` / `failed` / `stopped` |
| 失败响应 | 打开流前：400 空白、超长（`error` 为「您输入的文案太长了，请您缩减后再次发送。」）、图片不属于本账号；400 `model_id` 为 `deepseek-v4-pro` 且 `image_ids` 非空（`error` 为「当前模型看不了图片，请改用 Flash 后再发送图片。」）；401；409 无项目 |

`text` 超长、Pro 带图、或图片未先经 API-033 成功时，不创建对话、不创建用户消息。不把本轮模型改成 Flash，也不把图发给 Pro。前端在 Pro 下不应调用本接口带 `image_ids`；切到 Pro 时清掉待发送图片。

---

### API-036 在已有段中发送

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-014 AC-061～AC-067 AC-087；REQ-016 AC-074～AC-086 |
| Method / URL | POST /api/conversations/{conversation_id}/messages |
| 请求 | 同 API-035 的 `text`、`image_ids`。不传 `model_id`；使用该段当前 `conversation.model_id`（输入框切换后应先 API-031） |
| 成功响应 | 同 API-035 的 SSE。`title_customized=false` 时不改标题 |
| 失败响应 | 同 API-035；404 非本账号对话；409 该段已有 `generating` 的助手消息 |

生成管线与 API-035 相同，见 §五。

---

### API-037 停止生成

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-014 AC-064 |
| Method / URL | POST /api/conversations/{conversation_id}/messages/{message_id}/stop |
| 请求 | 无 body。`message_id` 必须是该段当前 `generating` 的助手消息 |
| 成功响应 | 200 JSON：`{ "message": MessagePublic }`。已有最终文字 → `status=stopped`，保留文字，不能再对该条发送/编辑/重新生成（下一次用户发送视为新一轮）。尚无文字 → 删除该助手行，用户消息保留，可再次发送 |
| 失败响应 | 400 非 generating；404；409 |

前端中止 SSE 不等于停止：必须调本接口。生成在服务端任务中运行，刷新或关掉发起请求的标签不会自动停止（另一边浏览器仍应能收到完成结果，AC-059）。

---

### API-038 重试失败回答

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-016 AC-084 AC-085 AC-086 |
| Method / URL | POST /api/conversations/{conversation_id}/messages/{message_id}/retry |
| 请求 | 无 body。目标必须是 `status=failed` 的助手消息 |
| 成功响应 | SSE，无新的 `user_message`；`accepted.assistant_message` 为同一 `message_id` 回到 `generating`。成功后该位置变为新回复 |
| 失败响应 | 400 状态不是 failed；404；409 |

不新增用户消息。使用该段当前 `model_id`。

---

### API-039 重新生成最新助手回复

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-014 AC-065 |
| Method / URL | POST /api/conversations/{conversation_id}/messages/{message_id}/regenerate |
| 请求 | 无 body。仅当该条是本段最新一条助手回复，且 `status` 为 `complete` 或 `stopped` |
| 成功响应 | SSE，替换同一 `message_id` 的内容与 `feedback`（重置为 `none`），不另增一条 |
| 失败响应 | 400 不是最新助手条或正在生成；404 |

更早的助手回复不能重新生成。

---

### API-040 编辑最新用户消息并重新发送

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-014 AC-065 AC-087 |
| Method / URL | PATCH /api/conversations/{conversation_id}/messages/{message_id} |
| 请求 | `text`、`image_ids`，规则同 API-035。目标必须是本段最新一条用户消息 |
| 成功响应 | SSE。原用户消息改为新内容；紧跟的助手回复同一 `message_id` 被新回答替换（无助手条则新建）。`accepted` 含更新后的两条 |
| 失败响应 | 400 不是最新用户条、空白、超长；400 该段当前为 Pro 且 `image_ids` 非空（`error` 为「当前模型看不了图片，请改用 Flash 后再发送图片。」）；404；409 正在生成 |

取消编辑只在前端，不调本接口。

---

### API-041 赞或踩

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-014 AC-065 |
| Method / URL | PATCH /api/conversations/{conversation_id}/messages/{message_id}/feedback |
| 请求 | `{ "feedback": "like" | "dislike" | "none" }` |
| 成功响应 | 200，该条 `MessagePublic`。不改 `content` |
| 失败响应 | 400 非助手消息；404 |

同一条只能处于赞、踩或都没有。再点当前状态则前端传 `none`。

---

### API-042 跨页实时事件

| 项目 | 内容 |
| --- | --- |
| 关联需求 | REQ-013 AC-059 |
| Method / URL | GET /api/conversations/events |
| 请求 | 无 body；Cookie 鉴权。`Accept: text/event-stream` |
| 成功响应 | 200 SSE。事件：`conversation.upserted`（data 为 `ConversationPublic`）、`conversation.deleted`（`{ id }`）、`message.upserted`（`MessagePublic`，含 generating / complete / failed / stopped）。不推送 token 增量（发起请求的标签走生成接口的 `delta`） |
| 失败响应 | 打开流前 401 / 409 |

所有已登录且已有婚礼项目的功能页打开一条本连接。两个浏览器打开同一段时：一边发送后，另一边先收到用户消息 upsert，待生成结束收到助手 upsert；重命名、删除同样推送。1.0 单进程内存订阅即可；多 worker 不在 1.0 范围。

失败示例（未登录）：HTTP 401，`error_code=UNAUTHORIZED`。

---

### EXT-001 阿里云号码认证发送短信（外部）

来源：[SendSmsVerifyCode](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode)、[个人开发者接入](https://help.aliyun.com/zh/pnvs/use-cases/sms-verify-for-individual-developers)（2026-10-06 查阅）。个人实名使用号码认证的赠送签名和赠送模板，不调用企业短信 `SendSms`。

- URL：`https://dypnsapi.aliyuncs.com`
- 风格：RPC；POST
- 头：`x-acs-action: SendSmsVerifyCode`；`x-acs-version: 2017-05-25`；ACS3-HMAC-SHA256 自签名
- 业务参数：`PhoneNumber`（单号码）、`SignName`（赠送签名）、`TemplateCode`（赠送模板，找回密码为 `100003`）、`TemplateParam`。验证码仍由本服务生成并本地校验，模板同时传验证码和分钟数，例如 `{"code":"123456","min":"5"}`。`min` 由 `password_reset_ttl_seconds` 向上取整到分钟，默认 300 秒对应 `5`。不传 `RegionId`
- 成功：HTTP 200 且 JSON `Code === "OK"`
- 客户端：`httpx.AsyncClient(trust_env=False)`，超时取 `aliyun_sms_timeout_seconds`；配置来自 `backend/.env`，禁止 SDK
- 不自动重试，避免重复计费

Mock 模式不调用本接口。

---

### EXT-002 Deepseek Chat Completions（外部）

查阅日期 2026-10-02。来源：

- Chat Completions：[https://api-docs.deepseek.com/api/create-chat-completion](https://api-docs.deepseek.com/api/create-chat-completion)
- 模型与定价：[https://api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing)
- 视觉输入：[https://api-docs.deepseek.com/guides/vision](https://api-docs.deepseek.com/guides/vision)
- 思考模式：[https://api-docs.deepseek.com/guides/thinking_mode](https://api-docs.deepseek.com/guides/thinking_mode)
- 错误码：[https://api-docs.deepseek.com/quick_start/error_codes](https://api-docs.deepseek.com/quick_start/error_codes)
- 首次调用（模型名与 base_url）：[https://api-docs.deepseek.com/](https://api-docs.deepseek.com/)

协议要点（不得凭空改字段名）：

- URL：`POST https://api.deepseek.com/chat/completions`（配置 `deepseek_base_url`，默认该源；路径 `/chat/completions`）
- Header：`Authorization: Bearer <deepseek_api_key>`；`Content-Type: application/json`
- 客户端：`httpx.AsyncClient(trust_env=False)` 流式读取；禁止官方 SDK
- `stream: true`：data-only SSE，以 `data: [DONE]` 结束。增量在 `choices[0].delta.content`；思考增量在 `choices[0].delta.reasoning_content`（若开启思考）。本产品只把 `content` 转给用户
- 当前可选模型（定价页）：`deepseek-flash`（DeepSeek-V4.1-Flash，**Vision ✓**，上下文 1M，最大输出 384K）；`deepseek-v4-pro`（DeepSeek-V4-Pro-0813，**Vision 不支持**，上下文 1M，最大输出 384K）。遗留名 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 仍被接受但已退役，请求由 Flash 承接并按 Flash 计费；产品下拉不展示遗留名
- 图片：仅用户消息；`content` 为数组，`{type:text,text}` 与 `{type:image_url,image_url:{url,detail}}`。`url` 为 `http(s)`（≤8192 字符）或 `data:image/jpeg;base64,...`。格式 JPEG/PNG/GIF/WebP，由文件内容检测。单张 base64/外链上限 32 MiB，请求体 48 MiB。本产品单张 ≤5MB，用本地文件转 data URL，`detail` 取 `auto`（文档：当前等同保留原图）。图片不得放进 `system`/`assistant`（400）。非视觉模型收到图片返回 400（文档：vision 模型才接受图片）
- 思考：官方默认开启。本产品已确认关闭（D-006-A）。每次 EXT-002 请求体固定带 `thinking: { "type": "disabled" }` 与 `reasoning_effort: "none"`。仍只把 `content` 转给用户；若对端仍回 `reasoning_content` 则丢弃、不展示。1.0 不传 `tools`
- `max_tokens`：未设时非思考默认 8K、思考默认 64K。本产品配置默认 8192
- 失败 HTTP：400 格式非法；401 密钥错误；402 余额不足；422 参数非法；429 速率限制；500 服务端错误；503 过载。本产品映射见 §六：429 与 503 → `rate_limited`；超时（本侧 httpx 时限）→ `timeout`；其余含 401/402/400/422/500 及中途断流 → `other`。用户不可见密钥与余额
- 并发限制（定价页）：Flash 2500、Pro 500，远高于本产品单账号 1.0 用量

本产品默认模型：`deepseek-flash`（能看图、单价更低）。下拉展示「DeepSeek Flash」「DeepSeek Pro」，值分别为 `deepseek-flash`、`deepseek-v4-pro`。

Mock：`deepseek_mode=mock` 或不配置密钥时不访问公网；按固定间隔输出一段范围内的备婚 Markdown，走同一套 SSE 事件。密钥未配置不阻塞注册、登录、计划书、预算、座位。

图片能否被当前对话模型看见：仅当本轮实际调用 `deepseek-flash`（或文档所述由其承接的遗留视觉名）时，用户消息里的图片会进入模型。`deepseek-v4-pro` 官方标注 Vision 不支持。D-005-B：选 Pro 时本轮不得带图；前端不加入待发送，后端若收到 `image_ids` 则 400，文案见 AC-087。不自动改用 Flash，也不把图放进发给 Pro 的 messages。

---

## 三、接口请求数据的类型选型

传输：REQ-001～REQ-011 的自有接口仍为 `application/json; charset=utf-8`。XiaoBei：列表/改名/删除/赞踩为 JSON；上传图片为 `multipart/form-data`；读图为原始字节；生成与跨页事件为 SSE。无 WebSocket。

共享类型：

| 类型 | 规则 |
| --- | --- |
| 金额 | 整数分 `*_fen`；人民币；显示两位小数 = fen/100 |
| 日期 | `YYYY-MM-DD` 字符串，按 `Asia/Shanghai` 日历日，不带时刻 |
| 画布坐标 | 浮点，单位 CSS 像素，原点为画布逻辑坐标 |
| 缩放 | 正浮点，默认 1 |
| ID | 整数主键 |
| 手机号 | `^1[3-9]\d{9}$` |
| 用户名 | 去首尾空白后 2～32 个 Unicode 码点；允许汉字、字母、数字和中间空格；禁止换行与控制字符；全站唯一。存库为 trim 后的值。须能注册并登录「Kevin Wang」「王恺博」「1号新人」（AC-099～AC-102）。个人中心展示存库值，不读新郎/新娘昵称 |
| 密码 | ≥8 位，同时含大写、小写、数字；只收明文，只存 bcrypt 哈希 |
| 验证码 | 6 位数字，TTL 300 秒，60 秒内不可重发 |
| UserSession | `id` int；`username` string（上列注册用户名）；`phone` string；`has_wedding` boolean。不含头像、不含首字母、不含婚礼档案昵称 |
| XiaoBei 单条文字 | Unicode 码点 ≤ 4000（配置 `xiaobei_max_text_chars`）；超过不发送，文案见 AC-063 |
| XiaoBei 图片 | 单张 ≤ 5242880 字节；仅 JPEG/PNG/GIF/WebP（魔数）；落盘 `backend/data/xiaobei_images/` |
| XiaoBei 模型 id | 仅 `deepseek-flash`、`deepseek-v4-pro` |

枚举存中文，与 PRD 一致：

- 任务状态：未开始 / 进行中 / 已完成 / 已超期。已超期展示为正红 `#FF0000` 底白字，不计入已完成或进行中。读取任务时，若 `due_date` 早于当天且状态不是已完成，则把状态写成已超期。用户仍可手动把状态改为已超期；已完成不因截止日期过去而改写。
- 任务阶段：存在 `stages` 表。新建项目写入五个默认阶段，名称依次为备婚启动期、正式筹备期、婚前冲刺期、婚礼月、婚礼周。之后名称、顺序和有无都由用户决定。展示序号不存，按 `sort_order` 写成 STAGE-01 起
- 预算状态：未确定 / 已确定 / 已支付。默认未确定。展示色与任务状态同一套：未确定灰底灰字，已确定绿底白字，已支付蓝底白字。
- 出席：待定 / 已确认 / 已婉拒

跨请求：登录态只在 Cookie JWT；婚礼项目以 `user_id` 一对一持久化；模块数据经 `wedding_id` 归属，不在客户端传项目 id（避免越权）。验证码哈希存表，TTL 后失效，用过即删。XiaoBei 对话以 `user_id` 归属，不挂 `wedding_id`；生成任务 id 存在服务端内存，跨请求用 message 行的 `status`。图片先上传得 `image_id`，发送时引用；删除对话后删除未再引用的文件。

### 存储（SQLite `backend/data/Wedding_Master.db`）

| 表 | 要点 |
| --- | --- |
| users | username 唯一（存 trim 后的注册名，无头像列、无头像文件）；phone 唯一；hashed_password；credential_version 默认 0 |
| weddings | user_id 唯一；start_date；wedding_date；city；total_budget_fen；guest_estimate；groom_nickname 可空；groom_birthday 可空日期；bride_nickname 可空；bride_birthday 可空日期；other_preference 可空文本；canvas_scale 默认 1；canvas_offset_x/y 默认 0 |
| tasks | wedding_id；name；stage_id；due_date；status；due_date_customized 默认 false（建项模板为 false）；sort_order 为阶段内顺序，从 0 起 |
| stages | wedding_id；name 为【】内的名称；sort_order 从 0 起。删除阶段时删除其下全部任务 |
| budget_categories | wedding_id；name；amount_fen；status；note 可空；sort_order |
| guest_groups | wedding_id；name；is_preset；同项目 name 唯一 |
| guests | wedding_id；name；group_id；attendance；seq 整数默认 0；note 可空；table_id 可空 |
| tables | wedding_id；table_number；name；capacity；is_head；pos_x；pos_y |
| password_reset_codes | phone；code_hash；expires_at；sent_at |
| conversations | user_id；title（自动标题最长与单条用户文字相同，4000 码点；用户改名后 1～200 个字符）；title_customized 默认 false；model_id 默认 `deepseek-flash`；last_message_at |
| conversation_messages | conversation_id；role；status；error_kind 可空；content；earlier_unused 默认 false；module_link 可空；feedback 默认 none；model_id 可空；sort 按 id |
| conversation_images | user_id；message_id 可空（上传后、发送前未挂消息）；stored_name；byte_size；content_type |

外键：宾客/桌/任务/分类/分组 → weddings；宾客.table_id → tables ON DELETE SET NULL（删桌后宾客回未排座池）。`conversation_messages` → `conversations` ON DELETE CASCADE；`conversation_images.message_id` → messages ON DELETE SET NULL 后由删除对话的服务清理文件。账号删除不在 1.0 范围，无注销级联需求。退出登录只清 Cookie，不删用户行、不删对话。改婚礼档案不删对话。

模板任务名称与阶段以 PRD REQ-005 表格为准，种子数据放 `backend/src` 内常量，用户不能保存为新模板。

XiaoBei 提示词独立文件：`backend/src/prompts/xiaobei_system.md`。用户原话是运行时输入，不写进该文件。

---

## 四、模型选型与提示词设计

适用。1.0 仅 XiaoBei 调用 LLM。无 Embedding、无 Agent、无工具循环。计划书任务仍来自内置模板。座位表不提供智能排座。生成服务禁止调用任务、预算、宾客、座位、档案的写接口。

### 服务商与模型

- 服务商：Deepseek 官方 `https://api.deepseek.com`（中国站公开文档）。平台统一密钥，用户不能填密钥，不能选其他公司模型
- 下拉与默认：见 EXT-002。默认 `deepseek-flash`。选择跟当前 `conversations.model_id` 走
- 地域：按官方 endpoint，无单独 region 字段
- 能力：流式 ✓；Flash 图片 ✓；Pro 图片 ✗（定价页 Vision 列）；上下文 1M；最大输出 384K
- 思考开关：关闭。请求体 `thinking.type=disabled`、`reasoning_effort=none`（D-006-A）。页面只展示最终 `content`，不展示思考过程，不新增产品文案
- 配置字段见 §七。`deepseek_mode=mock` 时不发起真实调用

### 每次调用的消息结构

1. `system`：来自 `backend/src/prompts/xiaobei_system.md` 的固定说明 + 本轮动态档案四项（婚礼日期、城市、总预算两位小数人民币、总人数）。不含开始备婚日期。不含任务、预算分类、宾客、座位
2. 历史：从最新往更早打包用户/助手 `content`（助手只带最终回答文本，不带思考）。用户历史若含图：仅当本轮模型为 Flash 时附带 `image_url`；本轮为 Pro 时历史只带文字，页面上的旧图仍在，不送给 Pro
3. 本轮用户消息：Flash 可带文字与图片 data URL（本机文件，Deepseek 不需要可公网访问的图床）。Pro 只带文字；带图则在调用前 400，不发起 EXT-002

输出：Markdown 最终回答。允许段落、标题、加粗、有序/无序列表、表格。解析：只取 `delta.content` / `message.content`。若整段回复（去空白）等于或仅含 PRD 超出范围原句，则 `module_link=null`，正文强制为该原句。若正文末行匹配 `[[xiaobei_link:plan|budget|seating]]`，去掉该行并设置对应 `module_link`（一条最多一个；非法或多个则全忽略）。用户复制时不含该标记。

`finish_reason=length`：视为 `other` 失败，不把截断稿留成 `complete`（与 AC-086 中途失败一致）。

### 系统提示词要点（文件内维护原文级约束）

- 身份：自称备备；自由生成称呼用户为「你」；固定文案中的「您」保持「您」
- 只回答结婚、婚礼、备婚、礼仪、流程、预算思路、宾客和座位思路。超出范围时**只输出** PRD AC-074 原句，不要解释
- 图片同样按该范围判断
- 英文提问仍用简体中文答；先短结论，用户要求展开再写步骤
- 不点名商家、不给具体价格或价位区间；可引用档案总预算
- 用户这句话里的城市、月份、花费标准按这句话回答。档案总预算明显低于该标准时，按该标准答并追加 PRD AC-081 原句模板（金额与档案一致、两位小数）；接近或低于档案总预算时不写
- 问自己的任务/进度/下一步 → 正文建议后末行 `[[xiaobei_link:plan]]`。问自己的分类预算/已分/剩余 → `budget`。问自己的宾客/桌位/排座 → `seating`。通用知识不要这三个标记。不要编造任务名、分类金额、宾客姓名
- 用户要求改任务、预算、宾客、座位、档案：只给文字建议，并写明 XiaoBei 不会直接改
- 彩礼：构成与地区差异，不给一个具体金额当标准。婚前协议/财产/离婚/合同/定金 → 建议咨询律师。宗教民族地域习俗对错 → 建议咨询熟悉该习俗的可靠人士。黄道吉日和八字 → 建议咨询择日或命理专业人士。备孕身体医疗 → 建议咨询医生。这六类以通用信息开始，以「以上回答仅提供参考，不作为专业意见，建议咨询对应的专业人士。」结束
- 没有把握：先说明不确定，再给一个保守下一步，不用固定整句
- 不输出思考过程、不提密钥、不提条数上限、不调用工具

`thinking` / `reasoning_effort` 已按 D-006-A 写入 EXT-002。Pro 与图片已按 D-005-B 写入 §五与 API-035/036/040。

---

## 五、接口逻辑算法设计

「今天」一律 `Asia/Shanghai` 的日历日（倒计时、已超期、当前阶段）。个人中心日期除外：按浏览器本地日历日，见本节「个人中心展示」。

### 建议截止日期（建项与改婚礼日重算共用）

对婚礼日 `W`：

- 备婚启动：`W` 减 6 个日历月，日号不变；目标月无该日则该月最后一天
- 中期筹备：减 3 个日历月，同上
- 婚前冲刺：减 1 个日历月，同上
- 婚礼月：`W` 减 7 天
- 婚礼周：`W` 当天

AC-012：`W=2027-10-20` → 2027-04-20 / 2027-07-20 / 2027-09-20 / 2027-10-13 / 2027-10-20。`W=2027-03-31` 时中期=2026-12-31，冲刺=2027-02-28（非闰年）。

改 `wedding_date`（API-009）时：倒计时与当前阶段用新 `W`；对每条任务，若 `due_date_customized` 为 false，按该任务 `stage` 用上式重写 `due_date`；为 true 则不动。用户新增任务在创建时即为 true。AC-041。

### 当前阶段（API-010）

`days_until = (W - today).days`。

`calendar_months`：`(W.year-today.year)*12 + (W.month-today.month)`，若 `today.day > W.day` 再减 1。

按 PRD 先行命中：

1. `days_until < 0` → `current_stage=null`，不自动展开
2. `0 <= days_until <= 7` → 婚礼周
3. 同年同月且 `days_until > 7` → 婚礼月
4. `calendar_months <= 3` 且 `days_until > 7` → 婚前冲刺
5. `calendar_months <= 6` → 中期筹备
6. 否则 → 备婚启动

AC-015 六个「今天」必须按此命中对应阶段。前端：命中的阶段默认展开，列表顺序只用 `stages.sort_order`，不把当前阶段移到最前。该阶段已删除时，没有默认展开项。

### 阶段增删改与排序（AC-089）

- POST /api/stages：`name` 默认「新阶段」。201 `StagePublic`，`sort_order` 为当前末尾。
- PATCH /api/stages/{stage_id}：可改 `name`、`sort_order`。`name` 去空白后为空则 400，不保存。不接受客户端改展示序号。
- 长按超过 0.5 秒后拖动阶段时，只更新各阶段 `sort_order` 为新下标，从 0 起。阶段内任务的 `stage_id`、名称、状态、截止日期不变。未满 0.5 秒松手不发请求。
- DELETE /api/stages/{stage_id}：删除该阶段，并删除 `stage_id` 属于它的全部任务。200。取消不请求。

展示时序号单独做成白底粉字、字重 700 的标签，文案为 `STAGE-` 加两位序号，序号是 `sort_order + 1`。标签后面才是 `【name】`。

### 粘贴解析（API-022）

按行分割，去空白，跳过空行。已知分组名 = 预置 8 个 + 本项目已有自定义名。若一行能拆成 `姓名 + 空白 + 恰好等于某已知分组名的后缀`，则姓名写入该分组；否则整行当姓名，分组「新郎」。不从粘贴新建分组。不解析文件。

### 排座与画布

入座：校验桌属于本项目后写 `guest.table_id`。`seated_count > capacity` 仍成功。前端拖拽先本地更新芯片与计数，再调 API-023；失败则回滚位置并提示。经过目标桌的高亮、滚轮缩放、空白平移、仅顶部把手拖桌，均为前端；持久化：桌坐标走 API-026，画布缩放平移走 API-009，输入停止后约 400ms 防抖，页面隐藏时再各送一次。当前座位名单栏没有搜索和分组筛选，两个分区展示全部对应宾客。宾客芯片不按 `group_id` 区分。已排座与桌内使用同一颜色，未排座使用深灰底白字（色值见界面设计）。入座后姓名留在「已排座」，不从名单消失。添加弹窗收集姓名、分组、出席和宾客序号，未选出席时默认「待定」，序号留空时为 0。全部宾客名单在前端列出当前项目全部宾客，第一列是宾客序号，不展示备注。四列的表头和内容居中。已排座、未排座、每张桌上和全部宾客名单都按 `seq` 从小到大排列，相同序号保持原有先后，没有序号的旧数据按 0 显示。出席以标签展示，列表里不能直接改，只能在编辑弹窗里改，保存走 API-023。姓名、宾客类型、出席状态三个条件点「搜索」后在前端过滤，点「重置」清空。改姓名、分组、出席或宾客序号走 API-023，删除走 API-028。

### 预算合计

`allocated_fen = sum(categories.amount_fen)`；`unallocated_fen = total_budget_fen - allocated_fen`；`is_over_allocated = allocated_fen > total_budget_fen`。超分仍保存。

### XiaoBei 生成管线（API-035、API-036、API-038、API-039、API-040 共用）

1. 鉴权；确认该账号已有婚礼项目；读档案四项（`wedding_date`、`city`、`total_budget_fen`、`guest_estimate`）。不读 tasks / budget_categories / guests / tables / wedding_photos，也不读 `groom_nickname`、`groom_birthday`、`bride_nickname`、`bride_birthday`、`other_preference`
2. 校验文字与图片。本轮模型为 `deepseek-v4-pro` 且请求带 `image_ids` → 400，文案 AC-087，不写用户消息、不改模型、不调 EXT-002。Flash 下图片照常。然后写用户消息（重试不写用户消息；重新生成不改用户消息；编辑则更新最新用户消息）
3. 将助手消息置为 `generating`（新建或复用同一 id），`content` 空，`error_kind` 空。向 API-042 订阅者推 `message.upserted`（用户条立即可见）
4. 在服务端后台任务调用 EXT-002（`stream=true`，`thinking.type=disabled`，`reasoning_effort=none`）。请求生命周期不绑在发起标签的 TCP 上
5. 上下文打包：预留 `max_tokens` 与约 2k token 系统提示。历史从最新往前累加。中文按 1 token ≈ 1.5 码点估算；每张图按 1024 token（视觉文档上限）。装不下的更早消息仍留在库和页面，本轮不送模型，本轮助手 `earlier_unused=true`，页面显示「更早的内容可能没被这次回答用到」。全部装下则不显示
6. 只转发 `delta.content` 为 SSE `delta`。丢弃 `reasoning_content`。不把半截标为 `complete`
7. 正常结束：解析 `module_link` 标记，写 `complete`，推 upsert。失败：见 §六，半截不留成正常回复（`content` 清空，`status=failed`）。用户停止走 API-037，不走失败分支
8. 生成过程中该段拒绝 API-036/039/040；前端禁用发送、编辑、重新生成

**Pro + 本条含图片**（D-005-B）：前端不把图片加入待发送，提示「当前模型看不了图片，请改用 Flash 后再发送图片。」后端同样拒绝。不偷偷改用 Flash，也不把图发给 Pro。切到 Pro 时清掉已选未发送的图片。页面上已有的历史图片仍显示；发给 Pro 的历史 messages 只保留文字。

### 侧栏与落地（无新写接口）

登录成功且 `has_wedding=true` → `/plan`，不是 `/xiaobei`。侧栏模块顺序：新建对话、备婚计划书、预算管理本、婚宴座位表。`RequireAuth` + `RequireWedding` 包住四个模块及档案；无项目访问 `/xiaobei` 进建项。侧栏收起仍渲染四个模块入口。历史区域数据来自 API-029，四模块页与档案页共用。`/wedding` 不单独换掉内容区：按 `from` 继续渲染来源模块，档案抽屉盖在内容区上，从右向左进入（AC-096）。返回、再点一次侧栏「编辑婚礼档案」，或保存成功后，地址回到 `from`。没有新接口。

展开侧栏时，在历史区域下方、「编辑婚礼档案」上方渲染个人中心（REQ-018）：头像、用户名、日期与「编辑婚礼档案」「退出登录」的文字同一显隐组，收起则一起隐藏。收起后底部仍渲染三枚图标：设置（无点击）、编辑婚礼档案（同一 `toggle-archive`）、退出登录（同一确认弹窗）。登录、注册、找回密码、创建婚礼项目不使用功能页侧栏，故不展示。页面不写「个人中心」标题。

### 个人中心展示（无新写接口，AC-099～AC-102）

用户名：认证 Context 中的 `UserSession.username`（API-002 登录或 API-005 刷新）。禁止用 API-008 的 `groom_nickname` / `bride_nickname`。1.0 不能改用户名，展示值与注册时存库值相同。

日期：浏览器本地当天。`const d = new Date()`，文案为 `` `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` ``。月和日不补零，不显示星期，不用 `Asia/Shanghai`。进入功能页、切换路由和展开侧栏时按当时本地日期渲染；AC 不覆盖同一页跨自然日未刷新的跳变。

头像：不上传、不落盘、不读文件。一律按未设置头像，在正圆内显示首字母。圆没有边框，底色和白字取界面风格里的玫瑰粉与强调色上的白，不在本文件另定色值。

首字母 `avatarInitial(username)`：

1. 对 `username` 去掉首尾 Unicode 空白（含空格、制表、换行）。
2. 用码点取第一个字符：`Array.from(trimmed)[0]`，不要用 UTF-16 下标。
3. 若该字符为 `A–Z` / `a–z`：显示其大写（`Kevin Wang` → `K`）。
4. 若该字符为汉字（CJK 统一汉字 `U+4E00`–`U+9FFF`）：用前端依赖 `pinyin-pro` 取汉语拼音首字母并大写。调用 `pinyin(ch, { pattern: 'first', toneType: 'none' })`，**不要**设 `mode: 'surname'`（多音字用最常用读音，不按姓氏特殊读音）。`王恺博` → `W`。若该字无拼音结果，则显示该汉字本身。
5. 数字或符号：显示该字符本身（`1号新人` → `1`）。
6. 只取第一个字符，不取词首字母缩写。

点击：头像、用户名、日期和右侧设置图标都不是链接或按钮，无 `href`、无导航 `onClick`、无菜单。点击后路由不变，仍停在当前模块。不提供上传头像、改用户名或进入资料的入口。设置图标只展示，不打开页面。

### 逐接口体验

| API | 技术选择与触发场景 | 用户可见结果或代价 | 当前处理与依据 | 验收或验证 |
| --- | --- | --- | --- | --- |
| API-001 | 用户名或手机号重复 | 账号不创建，看到冲突原因 | 手机号全站唯一；用户名唯一 | AC-001 AC-002 AC-043 |
| API-002 | 记住 30 天 vs 会话 Cookie | 关浏览器后是否免输入 | AC-003 AC-004；Cookie 见第二节 | AC-003～AC-006 |
| API-003 | 短信耗时/失败/未配置 | 等待数秒；失败可 60s 后重发；开发无短信费 | 超时不重试；开发 Mock、生产阿里云 | AC-007 AC-008 |
| API-004 | 验证码错或密码违规 | 旧密码仍可用 | 先校验码再写密码 | AC-008 |
| API-005 | 打开站点恢复登录 | 先短暂「恢复登录」再进计划书或登录页 | 前端 loading 态，规范 api-client | AC-003 AC-004 |
| API-005 | 功能页展开侧栏 | 历史区域下看到首字母、注册用户名、本地当天日期；不能点 | 复用已有 `username`；首字母与日期纯前端。无新取舍 | AC-099～AC-102 |
| API-006 | 点击退出登录后点确认 | 回登录页；30 天 Cookie 清除；再进计划书需登录。点取消则不请求、仍停留 | D-004-B；清 Cookie | AC-044 AC-103 |
| API-007 | 建项生成 41 条 | 成功才进计划书；失败不留下半个项目 | 单事务；失败整单回滚 | AC-009 AC-010 AC-012 |
| API-009 | 改婚礼日 | 倒计时和当前阶段跟新年礼日；未手改任务重算，手改保留 | D-001-B；`due_date_customized` | AC-041 |
| API-010 | 计算当前阶段与进度 | 打开即看到婚礼日期、按用户顺序排列的阶段、倒计时、已完成和进行中 | 只读计算，返回档案婚礼日，无推送，不返回今日待办或逾期列表。`current_stage` 不改变 `sort_order` | AC-015～AC-018 |
| API-012 | 标已完成；改截止日期 | 进度 +1；该条之后改婚礼日不再重算 | 计划书点日期标签改 due_date 并置 customized。列表不提供改阶段 | AC-014 AC-041 |
| API-014～017 | 超分、改总预算 | 红字超分仍保存；改总额不改分类额 | PRD 已定 | AC-020 AC-021 AC-024 |
| API-022 | 只贴姓名 | 进「新郎」 | 已确认批量规则 | AC-027 |
| API-023 | 拖拽等待 | 芯片立即动；网络失败弹回 | 乐观更新 + 回滚，满足「立即」 | AC-031 AC-032 AC-034 |
| API-023 | 满桌 | 橙色提示仍入座 | 服务端不拒绝 | AC-032 |
| API-027 | 删有人的桌 | 人回未排座池，名单和总数不变 | D-002-B | AC-042 |
| API-029～032 | 列表/改名/删除 | 四模块侧栏同一份历史；删前确认；换电脑仍在 | 对话属账号；空对话不入库 | AC-053～AC-056 AC-058 |
| API-033 | 超 5MB / 非四类图片 | 整条不发送；原文提示 | 魔数校验；视频不调接口 | AC-062 |
| API-035/036 | 等待与流式 | 回复逐步出现；可停；生成中不能再发 | 服务端任务 + SSE；10s Axios 不用于本流 | AC-064 |
| API-035/036 | 关闭思考 | 最终文字更快开始出现；页面仍无思考过程 | D-006-A；请求关闭思考 | AC-064 AC-067 |
| API-035/036/040 | 选 Pro 时加图 | 图不进入待发送，看到说明；这一轮发不出图 | D-005-B；须先改回 Flash | AC-087 |
| API-035/036 | 长对话裁上下文 | 页面仍有早消息；可能出现「更早的内容可能没被这次回答用到」 | 从新往旧打包 | AC-060 |
| API-037 | 停止 | 有字则留下；无字则不留空回复 | 显式 stop，断 SSE 不够 | AC-064 |
| API-038 | 重试 | 不新增用户消息；失败位替换 | 复用 assistant id | AC-084～AC-086 |
| API-042 | 两浏览器 | 不刷新看到新消息、回复、改名、删除 | SSE 事件；生成不绑单连接 | AC-059 |

其余读写接口无新增重要取舍：短同步请求，失败可重试，无队列。

并发：多标签最后写入为准，不做冲突弹窗（1.0 单人使用）。重复提交建项第二次 409。重复点完成以最后状态为准。同一对话重复发送在已有 `generating` 时 409。Deepseek 调用失败不自动再打一次付费请求；用户点重试才第二次调用。

---

## 六、接口失败异常设计

共享错误：400 `VALIDATION_ERROR`；401 `UNAUTHORIZED`；403 `FORBIDDEN`（1.0 几乎不用，无角色）；404 `NOT_FOUND`；409 `CONFLICT`；500 `INTERNAL_ERROR`。信封见 §二。面向用户的 `error` 用中文；日志可含技术细节，禁止写密码、验证码明文、AccessKey。

校验失败不写库。业务失败（重复建项、验证码错误）不改变原数据。系统失败回滚当前事务。

| API | 触发 | HTTP / code | 用户提示与恢复 |
| --- | --- | --- | --- |
| API-001 | 密码或手机号不合规 | 400 | 展示具体规则；可改完再提交。AC-002 |
| API-001 | 用户名或手机号占用 | 409 | 换一个再注册。AC-043 |
| API-002 | 用户名或密码错 | 401 | 留在登录页。AC-005 |
| API-003 | 发送间隔 <60s | 400 | 提示剩余等待秒数 |
| API-003 | 手机未注册 | 404 | 该手机号未注册 |
| API-003 | Mock 外短信失败/超时 | 500 | 未改密码；可稍后重发。不自动重试 |
| API-004 | 码错/过期或新密码违规 | 400 | 密码不变。AC-008 |
| API-005 | Cookie 失效 | 401 | 前端进登录。AC-003。登录页不展示个人中心 |
| API-006 | 退出 | 200 | 清 Cookie，回登录页。无 Cookie 也 200。AC-044 |
| API-007 | 已有项目 | 409 | 已有项目的限制说明。AC-010 |
| API-007 | 中途写库失败 | 500 | 无婚礼项目，可重试建项 |
| 项目内 API | 未建项 | 409 | 前端送去建项 |
| API-023 | 网络失败（已乐观入座） | 前端超时/5xx | 芯片回原处，计数恢复，可再拖 |
| API-026 / 009 画布 | 保存失败 | 不打断拖拽 | 轻提示「位置未保存」，下次拖动再试 |
| API-027 | 桌不存在 | 404 | 桌仍在则刷新后再试 |
| API-028 | 宾客不存在 | 404 | 名单不变，刷新后再看。AC-047 |
| API-029～042 | 未登录 | 401 | 进登录 |
| API-029～042 | 未建项 | 409 | 前端送去建项。AC-051 |
| API-033 | 图片 >5MB | 400 | 「您上传的图片超过5M，请压缩后再发送。」不建消息。AC-062 |
| API-033 | 非 JPEG/PNG/GIF/WebP | 400 | 「您上传的图片无法识别，请换一张再发送。」AC-062 |
| API-035/036 | 空白（无字无图） | 400 | 前端本应不可点；后端仍拒，无额外文案需求 |
| API-035/036 | 文字 >4000 码点 | 400 | 「您输入的文案太长了，请您缩减后再次发送。」AC-063 |
| API-035/036/040 | Pro 且请求带图 | 400 | 「当前模型看不了图片，请改用 Flash 后再发送图片。」不创建或改写本轮消息。AC-087 |
| API-035/036 流中 | EXT-002 超过 `deepseek_timeout_seconds` 或首包/空闲超时 | SSE `failed` timeout | 用户消息保留；助手 `failed`；文案 AC-084；半截清空 |
| API-035/036 流中 | Deepseek 429 或 503 | SSE `failed` rate_limited | 文案 AC-085；不展示余额或切换其他公司入口 |
| API-035/036 流中 | 401/402/400/422/500、JSON 解析失败、中途断流、`finish_reason=length` | SSE `failed` other | 文案 AC-086；半截不留成 complete |
| API-036 | 段内已在生成 | 409 | 前端本应禁用发送 |
| API-038 | 对非 failed 重试 | 400 | 不发起 Deepseek |
| 生成类 | 缺密钥且非 mock | 按 other 失败 | 开发应走 mock；生产缺密钥不能让用户填 |
| JSON 接口 | 前端 10s 超时 | Axios reject | 同步写操作提示失败并可再点；不认为服务端已成功，除非已收到 2xx。生成与 API-042 不使用该超时 |

客户端断开：JSON 写操作若已 commit 则保留。XiaoBei 生成在后台继续，直到完成、失败或 API-037。发起标签刷新后通过 API-030 / API-042 恢复；另一标签不刷新也能看到终态。入座未收到 2xx 时前端回滚，可能与已 commit 不一致：刷新 GET 校正。不引入对账任务。

短信：一次请求只发一条；失败不重试。验证码存储 bcrypt/哈希，TTL 后删除。同一手机新发使旧码失效。

Deepseek：用户未点重试/重新生成/重新发送前，一次用户动作只对应一次 EXT-002。停止后不继续计费调用（取消 httpx 流）。

无降级搜索、无部分粘贴成功（解析后一次性插入；非法则整批不写）。粘贴 0 行有效内容 → 400。XiaoBei 无降级到其他模型供应商。

---

## 七、项目本地层级设计

```
Projects_Repo/Wedding_Master/
├── docs/                    # PRD、本方案、decisions
├── pycore/                  # PYTHONPATH 引入，不 pip 安装
├── backend/
│   ├── .env / .env.example
│   ├── requirements.txt
│   ├── data/                # Wedding_Master.db；xiaobei_images/；gitignore
│   ├── src/
│   │   ├── main.py          # APIServer，端口与 CORS 来自 config
│   │   ├── config/          # AppSettings + ConfigManager，use_env=False
│   │   ├── api/deps.py      # get_db、get_current_user（Cookie JWT）
│   │   ├── api/routes/      # users.py, weddings.py, tasks.py,
│   │   │                   # budget_categories.py, guest_groups.py,
│   │   │                   # guests.py, tables.py,
│   │   │                   # conversations.py, conversation_images.py
│   │   ├── models/          # Pydantic DTO
│   │   ├── db/models.py、session.py
│   │   ├── repositories/
│   │   ├── services/        # 含 sms_sender（mock / aliyun）、xiaobei_generator（mock / deepseek）
│   │   ├── prompts/         # xiaobei_system.md
│   │   └── utils/           # 日期回推、阶段判定、粘贴解析、图片魔数
│   └── tests/
├── frontend/
│   ├── .env / .env.example
│   └── src/
│       ├── main.tsx、App.tsx
│       ├── router/          # RequireAuth、RequireWedding；默认登录后 /plan；/xiaobei
│       ├── pages/           # Login、Register、PasswordReset、CreateWedding、
│       │                   # Plan、Budget、Seating、XiaoBei
│       ├── components/      # 侧栏（四模块 + 历史区域 + 个人中心块）、退出、任务分组、桌卡片、宾客芯片、画布、对话消息与输入
│       ├── stores/          # Auth、当前婚礼、XiaoBei 事件订阅
│       ├── services/        # axios 单例与各资源 API；conversations 的 fetch SSE
│       ├── hooks/、types/、utils/  # utils 含 avatarInitial（pinyin-pro）与本地日期文案
│       └── vite.config.ts   # port 5199，proxy /api（SSE 走同一代理）
└── pyproject.toml           # ruff/mypy/pytest，范围 backend/src 与 backend/tests
```

运行：

- Python：开发时探测 3.11+，项目内 `.venv`。`cd backend && PYTHONPATH=.. python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8099`
- 前端：`cd frontend && npm run dev -- --host 127.0.0.1 --port 5199`
- 门禁：前端 5175 + `VITE_BACKEND_PROXY_TARGET=http://localhost:8003`；后端 8003
- pytest：`python -m pytest backend/tests --timeout=120`（需 pytest-timeout）

CORS 允许：`http://localhost:5199`、`http://127.0.0.1:5199`、`http://localhost:5175`、`http://127.0.0.1:5175`。

### 配置（只写字段名；真实值在 .env，不入库）

后端 `backend/.env.example`：

| 字段 | 类型 | 默认 | 用途 | 敏感 |
| --- | --- | --- | --- | --- |
| secret_key | string | 无默认，必填 | JWT 签名 | 是 |
| database_path | string | `data/Wedding_Master.db` | SQLite，启动时转绝对路径并建父目录 | 否 |
| host | string | 127.0.0.1 | 监听 | 否 |
| port | int | 8099 | Agent 开发端口 | 否 |
| cors_origins | JSON list | 上列四地址 | CORS | 否 |
| timezone | string | Asia/Shanghai | 今天/倒计时 | 否 |
| jwt_algorithm | string | HS256 | JWT | 否 |
| jwt_expire_minutes_session | int | 720 | 未勾选记住时 JWT 过期 | 否 |
| jwt_expire_days_remember | int | 30 | 勾选记住 | 否 |
| bcrypt_rounds | int | 12 | 密码哈希 | 否 |
| password_reset_ttl_seconds | int | 300 | 验证码有效期 | 否 |
| password_reset_resend_seconds | int | 60 | 重发间隔 | 否 |
| sms_mode | string | mock | mock 或 aliyun | 否 |
| aliyun_sms_access_key_id | string | 空 | EXT-001 | 是 |
| aliyun_sms_access_key_secret | string | 空 | EXT-001 | 是 |
| aliyun_sms_sign_name | string | 空 | 号码认证赠送签名 | 否 |
| aliyun_sms_template_code | string | 空 | 赠送模板，找回密码用 `100003` | 否 |
| aliyun_sms_endpoint | string | https://dypnsapi.aliyuncs.com | 号码认证 | 否 |
| aliyun_sms_region | string | cn-hangzhou | 保留，SendSmsVerifyCode 不发送 | 否 |
| aliyun_sms_template_param_key | string | code | 验证码变量名；另固定传 `min` | 否 |
| aliyun_sms_timeout_seconds | int | 10 | httpx 超时 | 否 |
| deepseek_mode | string | mock | mock 或 live | 否 |
| deepseek_api_key | string | 空 | EXT-002 Bearer | 是 |
| deepseek_base_url | string | https://api.deepseek.com | Chat Completions 根 | 否 |
| deepseek_default_model | string | deepseek-flash | 新对话默认 | 否 |
| deepseek_allowed_models | JSON list | `["deepseek-flash","deepseek-v4-pro"]` | 输入框下拉 | 否 |
| deepseek_max_tokens | int | 8192 | 单次生成上限 | 否 |
| deepseek_timeout_seconds | int | 90 | 整次调用上限 | 否 |
| deepseek_idle_timeout_seconds | int | 45 | 流式两次增量之间 | 否 |
| xiaobei_max_text_chars | int | 4000 | 单条用户文字码点 | 否 |
| xiaobei_max_image_bytes | int | 5242880 | 单张图片 | 否 |
| xiaobei_image_dir | string | `data/xiaobei_images` | 对话图片落盘 | 否 |
| wedding_photo_max_count | int | 6 | 每个婚礼项目的照片张数 | 否 |
| wedding_photo_max_bytes | int | 5242880 | 档案单张照片 | 否 |
| wedding_photo_dir | string | `data/wedding_photos` | 档案照片落盘 | 否 |
| deepseek_thinking_type | string | disabled | EXT-002 `thinking.type` | 否 |
| deepseek_reasoning_effort | string | none | EXT-002 `reasoning_effort` | 否 |

前端：`VITE_API_BASE_URL=/api`；`VITE_BACKEND_PROXY_TARGET=http://localhost:8099`。个人中心首字母使用 npm 依赖 `pinyin-pro`，只在浏览器内转换，不请求外部拼音接口，后端不引入拼音库。

`backend/data/`、`backend/data/xiaobei_images/`、`.env`、`.venv`、`node_modules` 忽略。对话图片随删除对话清理；不提供清空该账号全部 XiaoBei 记录的入口。

### 外部服务

| 名称 | 用途 | 依赖 API | 配置状态 | 模式 | 真实验证 |
| --- | --- | --- | --- | --- | --- |
| 阿里云号码认证 SendSmsVerifyCode | 找回密码验证码 | EXT-001，由 API-003 调用 | 个人开发者在 `.env` 配置 | 开发默认 Mock；生产 aliyun | 赠送签名配赠送模板；按号码认证回执计费。缺密钥不阻塞注册/登录/四个模块 |
| Deepseek Chat Completions | XiaoBei 问答 | EXT-002，由 API-035/036/038/039/040 调用 | 密钥未提供 | 开发默认 Mock；生产 live | 需平台 Deepseek 账号与密钥、账户余额。缺密钥只阻碍 XiaoBei 真实验证。按 token 计费（见定价页峰时/闲时）。图片仅 Flash 可见 |

无其他第三方。无每人条数配额。密钥只出现在 `backend/.env`，文档只写字段名。

---

## 待确认事项

无待决项。D-001～D-006 已于 2026-10-02 确认，见 `docs/decisions.md`。本轮 REQ-018 无新的体验取舍，不新增决策记录。2026-10-03 用户确认本轮方案，文首 `status` 为 Confirmed。

缺少阿里云短信密钥只阻碍找回密码的真实验证。缺少 Deepseek 密钥只阻碍 XiaoBei 真实验证。开发均用 Mock，不阻塞其余工作。个人中心不依赖外部服务。

### REQ / AC 覆盖

| 需求 | AC | 路径 |
| --- | --- | --- |
| REQ-001 | AC-001 AC-002 AC-043 | API-001 |
| REQ-002 | AC-003～AC-006 AC-044 | API-002、API-005、API-006、Cookie 策略 |
| REQ-003 | AC-007 AC-008 | API-003、API-004、EXT-001 |
| REQ-004 | AC-009 AC-010 AC-011 AC-041 AC-097 AC-098 | API-007～API-009、API-012 |
| REQ-005 | AC-012～AC-015 | API-007、API-010～API-013 |
| REQ-006 | AC-016 AC-017 | API-010；AC-018 无推送接口 |
| REQ-007 | AC-019～AC-024 | API-008、API-009、API-014～API-017；AC-023 前端扇区；AC-025 无记账字段 |
| REQ-008 | AC-026～AC-029 AC-047 AC-049 | API-018～API-023、API-028；AC-029 无上传接口 |
| REQ-009 | AC-030～AC-036 AC-042 | API-023～API-027；AC-033 前端无长按 |
| REQ-010 | AC-037 AC-038 | API-008、API-009、API-020、API-026；AC-039 无导出 |
| REQ-011 | AC-040 | 前端路由 + 数据按 wedding 分表且无跨模块写；侧栏四项，默认落地 /plan |
| REQ-012 | AC-050～AC-053 | 前端侧栏与 RequireWedding；API-029、API-030 |
| REQ-013 | AC-054～AC-060 | API-029～API-032、API-035、API-042；AC-057 前端不提供入口 |
| REQ-014 | AC-061～AC-067 AC-087 | API-031、API-033～API-041；Enter/复制/欢迎区为前端；单条上限 4000；Pro 发图见 AC-087 |
| REQ-015 | AC-068～AC-073 | 前端呈现；数据来自 API-030 |
| REQ-016 | AC-074～AC-086 | 生成管线 + EXT-002 + API-035/036/038；写隔离；失败映射 §六 |
| REQ-017 | AC-090～AC-095 AC-096 | API-043～API-047；AC-096 前端抽屉 |
| REQ-018 | AC-099～AC-102 | API-002 / API-005 的 `username`；注册规则见 API-001 与第三节（须能写入示例名）；首字母、本地日期、排版与不可点击为前端；无头像接口 |

AC-001～AC-087 均有实现或明确缺位路径。AC-045、AC-046 为登录页显示密码，由前端完成。D-005、D-006 已确认并落入对应字段与 AC。AC-099～AC-102 不新增后端接口。
