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

## 重要限制

当前前端会按访问地址自动连接后端：

```txt
http://localhost -> ws://localhost:2567
非 localhost -> 当前域名
```

所以正式部署优先使用：

```txt
同一个域名访问客户端和服务端
```

如果要拆成：

```txt
app.example.com
api.example.com
```

需要先把 `client/src/backend.ts` 改成环境变量配置。

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
```

说明：

- `DATABASE_URL`：MySQL 连接地址。
- `JWT_SECRET`：登录 token 签名密钥，正式环境必须修改。
- `AUTH_REQUIRED_FOR_ROOMS`：设为 `1` 后，未登录用户不能进房间。

## 数据库

创建数据库：

```sql
CREATE DATABASE bomberman_yokonex
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

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
PORT=2567 node server/build/index.js
```

Windows PowerShell：

```powershell
$env:PORT="2567"
node server/build/index.js
```

## Nginx 示例

下面示例适合同域部署。

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

检查客户端和服务端是否同域。

检查 Nginx 是否正确反代 `/matchmake/`。

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
