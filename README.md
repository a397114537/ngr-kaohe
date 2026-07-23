# NGR 考核平台

错误升级工单 · 投诉表扬 · 任务百科，带后端权限（仅管理员可登录管理、填写审核结果；普通成员免登录直接填写）。

## 本地运行

```bash
node server.js
# 浏览器打开 http://localhost:3000
```

初始管理员：用户名 `admin` / 密码 `admin123`（首次启动自动创建，请登录后在「系统设置」修改密码、创建成员、指定审核人）。

## 部署到云端（让团队成员异地访问，你电脑关机也不影响）

本项目是「前端 + Node 后端」一体服务（`node server.js` 同时托管页面和接口），**需要能运行 Node 的云平台**，纯静态托管跑不了后端。

仓库里已附 `render.yaml`（Render Blueprint），部署几乎是一键的。

### 方式一：Render 一键 Blueprint 部署（推荐，免费、免信用卡）

1. 把本目录推送到你的 **GitHub 公开仓库**（本地已 `git init` 并提交，只需加远程并 push）。
2. 打开 https://render.com → 用 GitHub 登录注册。
3. 点 **New + → Blueprint** → 选择你的仓库。
4. Render 会自动读取 `render.yaml`：创建 Web 服务（Free 档）、挂持久盘 `/data`、设 `DB_PATH=/data/db.json`、启动 `node server.js`。
5. 点 **Apply**，等 1–2 分钟，Render 给你一个公网网址（形如 `https://ngr-kaohe.onrender.com`），直接发给团队即可访问。**你的电脑关机不影响运行。**

> 也可以点下面的按钮快速开始（需先把代码推到 GitHub 公开仓库）：
>
> [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=你的仓库地址)

### 方式二：手动 Web Service（同平台，更可控）

1. https://render.com → **New + → Web Service** → 关联仓库。
2. **Build Command**：`echo 'no build needed'`；**Start Command**：`node server.js`；**Instance**：Free。
3. 挂 **Persistent Disk**：Mount Path `/data`，并在 **Environment** 加 `DB_PATH = /data/db.json`（防止免费实例重启丢数据）。
4. 创建后获得公网网址。

### 备选平台

Railway / Fly.io：连接仓库 → 启动命令 `node server.js` → 挂持久卷并设置 `DB_PATH` 指向该卷。Railway 新账号有免费额度。

> 不挂持久盘也能跑，但免费实例重启时数据会重置——正式用务必挂盘。

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
