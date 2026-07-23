# NGR 考核平台

错误升级工单 · 投诉表扬 · 任务百科，带后端权限（仅管理员可登录管理、填写审核结果；普通成员免登录直接填写）。

## 本地运行

```bash
node server.js
# 浏览器打开 http://localhost:3000
```

初始管理员：用户名 `admin` / 密码 `admin123`（首次启动自动创建，请登录后在「系统设置」修改密码、创建成员、指定审核人）。

## 部署到云端（让团队成员异地访问）

本项目是「前端 + Node 后端」一体服务（`node server.js` 同时托管页面和接口），**需要能运行 Node 的云平台**，纯静态托管跑不了后端。

### 推荐：Render（免费、连 GitHub 自动部署，无需懂命令行）

1. 把本目录推送到你的 GitHub 仓库（或在本地 `git init` 后推送）。
2. 打开 https://render.com → 注册（可用 GitHub 直接登录）。
3. 点 **New + → Web Service** → 关联你的仓库。
4. 配置：
   - **Build Command**：留空（无依赖，零安装）
   - **Start Command**：`node server.js`
   - **Instance Type**：选 Free（免费）
5. 防止数据丢失（关键）：在 Render 给服务挂一个 **Persistent Disk**
   - Mount Path 填 `/data`
   - 在 **Environment** 里加变量：`DB_PATH = /data/db.json`
   - 这样所有考核数据存到持久盘，重启/重新部署都不丢。
6. 点 **Create Web Service**，等一两分钟，Render 会给你一个公网网址（形如 `https://ngr-xxxx.onrender.com`），直接发给团队即可访问。

> 不挂持久盘也能跑，但免费实例重启时数据会重置——正式用务必挂盘。

### 备选：Railway / Fly.io

同样：连接仓库 → 启动命令 `node server.js` → 挂载持久卷（Railway 叫 Volume，Fly 叫 Volume）并设置 `DB_PATH` 指向该卷。Railway 新账号有免费额度。

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 服务端口 | `3000` |
| `DB_PATH` | 数据库文件路径（挂持久盘时设为盘内路径） | `./data/db.json` |

## 权限说明

- **普通成员**：免登录，直接填写工单 / 投诉表扬 / 任务百科 / 申诉，查看统计表。
- **管理员**：登录后可用「系统设置」（成员管理、错误原因/扣分数配置）、删除记录、填写「是否审核通过」。
- 审核结果、配置增删、删除等写操作在服务端强制校验，非管理员调用会被拒绝（HTTP 403）。

## 数据

所有数据存于 `data/db.json`（或 `DB_PATH` 指定位置），单文件、无需数据库。首次启动自动建库并写入默认管理员。
