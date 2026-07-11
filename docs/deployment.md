# 部署文档

## 目标

从零开始部署 `Bomberman-Yokonex`，直到前端页面和后端服务都能访问。

本文覆盖两种情况：

- 无域名：直接用服务器 IP + 端口访问。
- 有域名：用 Nginx 反向代理访问。

服务器上已经运行旧版游戏时，请使用 [游戏增量部署文档](incremental-deployment.md)。

## 1. 准备环境

建议版本：

```txt
Node.js 22
MySQL 8
Git
```

可选：

```txt
PM2
Nginx
```

## 2. 克隆仓库

```bash
git clone https://github.com/tzwgoo/Bomberman.git
cd Bomberman
```

## 3. 安装依赖

```bash
npm run install:all
```

这个命令会安装：

- 根目录依赖
- `server` 依赖
- `client` 依赖

## 4. 创建 MySQL 数据库

登录 MySQL：

```bash
mysql -uroot -p
```

创建数据库：

```sql
CREATE DATABASE IF NOT EXISTS bomberman_yokonex
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

退出 MySQL：

```sql
exit;
```

## 5. 配置后端环境变量

复制模板：

Windows PowerShell：

```powershell
Copy-Item server\.env.example server\.env
```

Linux / macOS：

```bash
cp server/.env.example server/.env
```

修改 `server/.env`：

```env
DATABASE_URL="mysql://root:root@127.0.0.1:3306/bomberman_yokonex"
JWT_SECRET="请改成一段足够长的随机字符串"
AUTH_REQUIRED_FOR_ROOMS="1"
AUTH_SM4_KEY="0123456789abcdeffedcba9876543210"
AUTH_SM4_IV="fedcba98765432100123456789abcdef"
ADMIN_USERNAMES="admin"
```

说明：

- `DATABASE_URL`：MySQL 连接地址。
- `JWT_SECRET`：登录 token 签名密钥，正式环境必须修改。
- `AUTH_REQUIRED_FOR_ROOMS`：设为 `1` 后，未登录用户不能进房间。
- `AUTH_SM4_KEY`：注册 / 登录请求 SM4 解密密钥，必须是 32 位十六进制。
- `AUTH_SM4_IV`：注册 / 登录请求 SM4 CBC IV，必须是 32 位十六进制。
- `ADMIN_USERNAMES`：允许进入 EMS 设备后台的账号名，多个账号用英文逗号分隔。

`AUTH_SM4_KEY` 和 `AUTH_SM4_IV` 必须和前端构建配置保持一致。

## 6. 初始化表结构

推荐使用 Prisma 迁移。

```bash
npm --prefix server run prisma:generate
npm --prefix server exec prisma migrate deploy
```

如果不想用 Prisma 迁移，也可以直接执行 DDL：

```bash
mysql -uroot -p < docs/mysql-init.sql
```

注意：

- `docs/mysql-init.sql` 已包含 `CREATE DATABASE` 和全部业务表。
- Prisma 迁移和 DDL 二选一即可。
- 不要在同一个空库上重复执行两套初始化。

## 7. 无域名部署

无域名时，假设服务器 IP 是：

```txt
192.168.1.10
```

你需要把下面命令里的 IP 换成自己的服务器 IP。

推荐入口：

```txt
http://192.168.1.10:45179
```

这个端口由 Nginx 对外提供：

- 页面静态文件：直接从 `client/dist` 读取。
- 接口后缀：转发到后端 `127.0.0.1:45170`。
- WebSocket：`/matchmake/` 转发到后端 `127.0.0.1:45170`。

### 7.1 配置前端环境变量

在 `client` 目录创建 `.env.production`：

```env
VITE_BACKEND_WS_URL="ws://192.168.1.10:45179"
VITE_BACKEND_HTTP_URL="http://192.168.1.10:45179"
VITE_AUTH_SM4_KEY="0123456789abcdeffedcba9876543210"
VITE_AUTH_SM4_IV="fedcba98765432100123456789abcdef"
```

说明：

- `VITE_BACKEND_WS_URL`：Colyseus WebSocket 地址。
- `VITE_BACKEND_HTTP_URL`：登录、注册、排行榜等 HTTP 接口地址。
- `VITE_AUTH_SM4_KEY` / `VITE_AUTH_SM4_IV`：必须和服务端一致。

注意：

- 这里写 `45179`，不是 `45170`。
- 浏览器只访问 Nginx。
- Nginx 再把 `/auth`、`/rooms`、`/matchmake` 等接口转到后端。

### 7.2 构建项目

```bash
npm run build
```

构建产物：

```txt
server/build
client/dist
```

### 7.3 启动后端

Windows PowerShell：

```powershell
$env:PORT="45170"
node server/build/index.js
```

Linux / macOS：

```bash
PORT=45170 node server/build/index.js
```

后端验证：

```bash
curl http://192.168.1.10:45170/hello
```

应该返回：

```txt
Bomberman Yokonex server is running.
```

### 7.4 配置 Nginx 对外入口

创建 Nginx 配置：

```bash
sudo nano /etc/nginx/conf.d/bomberman.conf
```

写入：

```nginx
server {
    listen 45179;
    server_name _;

    root /opt/Bomberman/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /hello {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /auth/ {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /me {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /leaderboard {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /rooms/ {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /maps/ {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /matchmake/ {
        proxy_pass http://127.0.0.1:45170;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

检查并重载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

访问：

```txt
http://192.168.1.10:45179
```

如果服务器有防火墙，需要放行：

```txt
45179 前端端口
```

`45170` 可以不对公网放行，只给本机 Nginx 访问。

### 7.5 无域名的 EMS 设备限制

EMS 设备连接使用浏览器 Web Bluetooth。

DG-LAB 脉冲主机支持两种连接方式：

- BLE：浏览器直接连接郊狼 2.0 或 3.0。
- WebSocket：部署 `dglab-websocket-simple` v2 后，在客户端配置服务地址；仅支持郊狼 3.0。
- 指令 WebSocket：用于 YYC-DJ 类设备，固定连接 `ws://103.236.55.92:43001`，填写 UID、Token 后登录，并按游戏事件发送对应 `commandId`。

DG-LAB WebSocket 后端的完整部署步骤见 [dglab-websocket-backend-deployment.md](dglab-websocket-backend-deployment.md)。

客户端可通过环境变量提供默认地址：

```env
VITE_DGLAB_WS_URL="wss://ws.example.com"
```

正式 HTTPS 页面中的 DG-LAB 服务必须使用 `wss://`。连接后在首页“设备连接”使用 DG-LAB APP 的 SOCKET 功能扫码绑定。

YYC-DJ 指令服务使用文档给出的固定 `ws://` 地址，浏览器会在 HTTPS 页面阻止混合内容连接；请在 HTTP、localhost 或原生应用环境中使用。

指令 WebSocket 的 `commandId` 输入项已从对战大厅隐藏。默认值、触发条件和发送报文见 [commandId 与游戏事件映射](command-id-event-mapping.md)。

浏览器限制：

- `http://localhost`
- `http://127.0.0.1`
- `https://域名`

如果你用 `http://服务器IP:45179` 访问，很多浏览器不会允许 Web Bluetooth。

结论：

- 无域名/IP 访问可以正常玩游戏。
- 无域名/IP 访问不一定能连接 EMS 设备。
- 需要 EMS 设备连接时，建议配置 HTTPS 域名。

## 8. 有域名部署

假设域名是：

```txt
example.com
```

推荐同域部署：

```txt
https://example.com           前端页面
https://example.com/auth      后端接口
https://example.com/matchmake WebSocket
```

### 8.1 前端生产环境变量

同域部署可以不配置后端地址，让前端按当前域名访问。

如果要显式配置：

```env
VITE_BACKEND_WS_URL="wss://example.com"
VITE_BACKEND_HTTP_URL="https://example.com"
VITE_AUTH_SM4_KEY="0123456789abcdeffedcba9876543210"
VITE_AUTH_SM4_IV="fedcba98765432100123456789abcdef"
```

然后构建：

```bash
npm run build
```

### 8.2 启动后端

后端监听本机端口：

```bash
PORT=45170 node server/build/index.js
```

使用 PM2：

```bash
PORT=45170 pm2 start server/build/index.js --name bomberman-server
pm2 save
```

### 8.3 Nginx 配置

把前端构建产物放到：

```txt
/var/www/bomberman/client
```

Nginx 示例：

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
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /me {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /leaderboard {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /rooms/ {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /maps/ {
        proxy_pass http://127.0.0.1:45170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /matchmake/ {
        proxy_pass http://127.0.0.1:45170;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

正式环境建议再配置 HTTPS。

如果页面是 HTTPS，WebSocket 必须使用 `wss://`，不能使用 `ws://`。

## 9. 分域部署

示例：

```txt
前端：https://app.example.com
后端：https://api.example.com
```

前端 `.env.production`：

```env
VITE_BACKEND_WS_URL="wss://api.example.com"
VITE_BACKEND_HTTP_URL="https://api.example.com"
VITE_AUTH_SM4_KEY="0123456789abcdeffedcba9876543210"
VITE_AUTH_SM4_IV="fedcba98765432100123456789abcdef"
```

后端需要允许前端跨域。

如果后续配置了跨域白名单，可以设置：

```env
CLIENT_ORIGIN="https://app.example.com"
```

后端 Nginx 示例：

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:45170;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 10. 验证流程

### 10.1 服务端

```bash
curl http://127.0.0.1:45170/hello
```

### 10.2 数据库

```bash
npm --prefix server exec prisma migrate status
```

### 10.3 前端

打开页面后检查：

1. 注册账号。
2. 登录账号。
3. 创建房间。
4. 两个账号进入同一房间。
5. 完成一局。
6. 打开个人信息，查看战绩是否更新。

### 10.4 EMS 设备

1. 使用 Chrome 或 Edge。
2. 用 HTTPS 域名访问页面，或在本机用 `localhost` / `127.0.0.1` 访问。
3. 首页点击 `设备连接`。
4. 点击 `连接EMS`。
5. 浏览器弹窗里选择 EMS 设备。

## 11. 常见问题

### 注册提示数据库未配置

检查：

- `server/.env` 是否存在。
- `DATABASE_URL` 是否正确。
- 服务端是否已重启。

### 前端访问接口 404

检查前端构建时的地址：

```env
VITE_BACKEND_HTTP_URL="http://服务器IP:45179"
VITE_BACKEND_WS_URL="ws://服务器IP:45179"
```

如果改过 `.env.production`，需要重新执行：

```bash
npm run build
```

### 登录成功但进房失败

检查：

- 后端端口是否能访问。
- `VITE_BACKEND_WS_URL` 是否正确。
- Nginx 是否正确反代 WebSocket。
- HTTPS 页面是否使用了 `wss://`。

### 对局结束没有战绩

检查服务端日志。

如果看到：

```txt
Match persistence skipped database_not_configured
```

说明服务端没有读到 `DATABASE_URL`。

### EMS 设备连接按钮没有弹出蓝牙选择框

检查：

- 浏览器是否是 Chrome 或 Edge。
- 是否使用 HTTPS。
- 如果没有域名，是否是在本机用 `localhost` 或 `127.0.0.1` 打开。
- 设备是否已开机。
- 设备是否被其他程序占用。

### 正式服还能游客进房

把 `server/.env` 改成：

```env
AUTH_REQUIRED_FOR_ROOMS="1"
```

然后重启服务端。
