# ClubCue 管理端（成员 B / 前端 2）

社团活动报名与签到系统 · 管理端前端。

> ⚠️ 本仓库同时保留了课程「数据库」任务的图书管理系统（`backend/` + `frontier/`），
> 两者业务无关、互不影响。**ClubCue 前端只在本目录（`client/`）内。**

## 技术栈

React 18.3 · Vite 6 · Ant Design 5 · TypeScript 5.7 · react-router-dom 6 · axios · dayjs · echarts · qrcode

技术选型与目录组织对标参考样例 `AheadPoints`。

## 快速开始

```bash
cd client
npm install                 # 源已配置为 registry.npmmirror.com
npm run dev                 # http://localhost:5173
```

演示账号（内置演示数据模式）：

| 角色 | 账号 | 密码 |
|---|---|---|
| ADMIN 系统管理员 | `admin` | `admin123` |
| ORGANIZER 组织人 | `org01` | `org123` |
| USER 社团成员 | `u24050814` | `user123` |

## 演示模式与真实后端切换

后端（成员 C/D）契约就绪前后端形态不同，通过 `.env` 一个开关切换：

```ini
# .env
VITE_USE_MOCK=true     # true：用内置演示数据独立运行（默认）
                       # false：请求真实后端 /api/v1
# VITE_API_BASE_URL=   # 留空走 Vite 代理（目标 http://localhost:3001）
```

每个 API 函数都是 `USE_MOCK ? mockX() : unwrap(http.x())`，**切换只改环境变量，页面代码零改动**。

内置演示数据保存在浏览器 `localStorage`（键 `clubcue-admin-mock-db-v1`），刷新不丢；
顶栏「重置演示数据」可一键还原。演示数据量：6 个活动（覆盖草稿/发布/下架/归档）、
274 条报名（覆盖待审核/通过/候补/驳回）、进行中活动的实时签到记录。

## 目录结构

```
client/
├── src/
│   ├── api/            # http.ts 请求封装 · mock.ts 演示数据与业务规则 · index.ts 领域 API
│   ├── auth/           # useAuth.tsx 登录态 · RequireRole.tsx 路由守卫
│   ├── components/     # AdminLayout 布局 · StatusTags 状态标签 · EChart 图表封装
│   ├── pages/          # Login · Dashboard · Activities · ActivityForm
│   │                   # Registrations · Checkin · Statistics
│   ├── types/          # 领域类型（与后端契约字段一致）
│   └── utils/          # download.ts 前端 Excel/CSV 导出兜底
├── vite.config.ts      # 端口 5173，/api 代理到 3001
└── .env.example
```

## 端口约定（与项目计划一致）

| 服务 | 端口 |
|---|---|
| 前端开发服务器 | 5173 |
| 后端 API（前缀 `/api/v1`） | 3001 |
| 接口文档 | 3001/api-docs |
| MySQL | 3306 |

## 常用命令

```bash
npm run dev          # 开发
npm run typecheck    # tsc 全量类型检查
npm run build        # 类型检查 + 生产构建
npm run preview      # 预览构建产物
```

## 文档

- [管理端操作文档](../docs/管理端操作文档.md)
- [管理端接口契约（提给后端 C/D）](../docs/管理端接口契约.md)
