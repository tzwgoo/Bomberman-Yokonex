# Deployment Guide

## 部署目标

把项目部署成可公网访问的多人对战服务。

当前部署假设：

- 服务端：Node.js + Colyseus
- 客户端：Vite 构建后的静态文件
- 数据库：MySQL 8
- ORM：Prisma
- 进程管理：PM2 或系统服务
- 反向代理：Nginx

## 部署方式选择

当前前端会按访问地址自动连接后端，也支持用环境变量显式指定：

```txt
本地 localhost / 127.0.0.1 -> http://127.0.0.1:5173
生产环境未配置变量时 -> 当前域名
```

推荐生产环境显式配置：

```env
VITE_BACKEND_WS_URL="wss://api.example.com"
VITE_BACKEND_HTTP_URL="https://api.example.com"
```

本地开发常用端口：

```txt
前端：http://127.0.0.1:5174
后端：http://127.0.0.1:5173
```

本文下面同时给出两种部署方式。

## 服务器准备

建议版本：

```txt
Node.js 22
MySQL 8
Nginx
PM2
```

安装依赖：

```bash
npm run install:all
```

## 环境变量

复制服务端环境变量模板：

```bash
copy server\.env.example server\.env
```

Linux / macOS：

```bash
cp server/.env.example server/.env
```

修改 `server/.env`：

```env
DATABASE_URL="mysql://user:password@127.0.0.1:3306/bomberman_yokonex"
JWT_SECRET="换成一段足够长的随机字符串"
AUTH_REQUIRED_FOR_ROOMS="1"
AUTH_SM4_KEY="0123456789abcdeffedcba9876543210"
AUTH_SM4_IV="fedcba98765432100123456789abcdef"
```

说明：

- `DATABASE_URL`：MySQL 连接地址。
- `JWT_SECRET`：登录 token 签名密钥，正式环境必须修改。
- `AUTH_REQUIRED_FOR_ROOMS`：设为 `1` 后，未登录用户不能进房间。
- `AUTH_SM4_KEY`：注册 / 登录请求 SM4 解密密钥，必须是 32 位十六进制。
- `AUTH_SM4_IV`：注册 / 登录请求 SM4 CBC IV，必须是 32 位十六进制。

前端环境变量示例：

```env
VITE_BACKEND_WS_URL="wss://api.example.com"
VITE_BACKEND_HTTP_URL="https://api.example.com"
VITE_AUTH_SM4_KEY="0123456789abcdeffedcba9876543210"
VITE_AUTH_SM4_IV="fedcba98765432100123456789abcdef"
```

`VITE_AUTH_SM4_KEY` / `VITE_AUTH_SM4_IV` 必须和服务端保持一致。

> 注意：SM4 可以避免注册 / 登录请求体直接暴露明文，但正式环境仍必须使用 HTTPS。

## 数据库

创建数据库：

```sql
CREATE DATABASE bomberman_yokonex
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

初始化表结构有两种方式，二选一。

### 方式一：Prisma 迁移

生成 Prisma Client：

```bash
npm --prefix server run prisma:generate
```

执行生产迁移：

```bash
npm --prefix server exec prisma migrate deploy
```

本地开发也可以用：

```bash
npm --prefix server run prisma:migrate
```

### 方式二：直接执行 DDL

项目提供完整初始化 SQL：

```txt
docs/mysql-init.sql
```

执行示例：

```bash
mysql -uroot -p < docs/mysql-init.sql
```

如果使用 DDL 初始化，不要在同一个空库上重复执行 `prisma migrate deploy`。

## 构建

```bash
npm run build
```

构建产物：

```txt
server/build
client/dist
```

## 启动服务端

直接启动：

```bash
node server/build/index.js
```

使用 PM2：

```bash
pm2 start server/build/index.js --name bomberman-server
pm2 save
```

默认服务端端口：

```txt
2567
```

也可以用环境变量指定：

```bash
PORT=5173 node server/build/index.js
```

Windows PowerShell：

```powershell
$env:PORT="5173"
node server/build/index.js
```

## 方式一：同域部署

同域部署是当前推荐方式。

访问方式：

```txt
https://example.com
```

部署结构：

```txt
example.com          -> client/dist 静态文件
example.com/auth     -> 反代到 server
example.com/me       -> 反代到 server
example.com/rooms    -> 反代到 server
example.com/maps     -> 反代到 server
example.com/matchmake -> 反代到 server WebSocket
```

把 `client/dist` 放到：

```txt
/var/www/bomberman/client
```

Nginx 配置：

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/bomberman/client;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /auth/ {
        proxy_pass http://127.0.0.1:2567;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /me {
        proxy_pass http://127.0.0.1:2567;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /leaderboard {
        proxy_pass http://127.0.0.1:2567;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /rooms/ {
        proxy_pass http://127.0.0.1:2567;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /maps/ {
        proxy_pass http://127.0.0.1:2567;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /matchmake/ {
        proxy_pass http://127.0.0.1:2567;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

如果 WebSocket 连接失败，需要补充 Colyseus 房间 WebSocket 路径反代。

## 方式二：前后端分域部署

分域部署适合前端静态站点和后端服务分开托管。

访问方式示例：

```txt
前端：https://app.example.com
后端：https://api.example.com
```

### 分域部署前置改动

当前 `client/src/backend.ts` 默认连接当前域名。

前端构建时配置：

```env
VITE_BACKEND_WS_URL="wss://api.example.com"
VITE_BACKEND_HTTP_URL="https://api.example.com"
```

服务端还需要允许前端域名跨域访问。

示例：

```ts
app.use(cors({ origin: "https://app.example.com" }));
```

如果使用环境变量，可以配置：

```env
CLIENT_ORIGIN="https://app.example.com"
```

### 前端 Nginx 示例

把 `client/dist` 放到：

```txt
/var/www/bomberman/client
```

Nginx 配置：

```nginx
server {
    listen 80;
    server_name app.example.com;

    root /var/www/bomberman/client;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 后端 Nginx 示例

服务端仍然监听本机 `2567`。

Nginx 配置：

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:2567;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

如果开启 HTTPS：

```txt
前端使用 https://app.example.com
后端 WebSocket 使用 wss://api.example.com
```

不要在 HTTPS 页面里连接 `ws://`，浏览器会拦截不安全连接。

## 验证

检查服务端：

```bash
curl http://127.0.0.1:2567/hello
```

检查数据库迁移：

```bash
npm --prefix server exec prisma migrate status
```

检查构建：

```bash
npm run build
npm --prefix server test
```

浏览器验证：

1. 打开站点首页。
2. 注册账号。
3. 登录账号。
4. 创建房间。
5. 两个账号完成一局。
6. 回到个人信息页，刷新账号战绩。

## 常见问题

### 注册提示数据库未配置

检查 `server/.env` 是否存在。

检查 `DATABASE_URL` 是否正确。

### 登录成功但进房失败

同域部署时，检查客户端和服务端是否同域。

检查 Nginx 是否正确反代 `/matchmake/`。

分域部署时，检查：

- `VITE_BACKEND_WS_URL` 是否是 `wss://api.example.com`。
- `VITE_BACKEND_HTTP_URL` 是否是 `https://api.example.com`。
- 服务端是否允许 `https://app.example.com` 跨域访问。

### 设备连接按钮没有弹出蓝牙选择框

EMS 设备连接使用浏览器 Web Bluetooth。

检查：

- 浏览器使用 Chrome 或 Edge。
- 本地开发使用 `http://127.0.0.1` 或 `http://localhost`。
- 正式环境必须使用 HTTPS。
- 设备已开机，并且没有被其他程序占用。

### 对局结束没有战绩

检查服务端日志。

如果看到：

```txt
Match persistence skipped database_not_configured
```

说明服务端没有读到 `DATABASE_URL`。

### 正式服还能游客进房

把 `server/.env` 改成：

```env
AUTH_REQUIRED_FOR_ROOMS="1"
```

然后重启服务端。
