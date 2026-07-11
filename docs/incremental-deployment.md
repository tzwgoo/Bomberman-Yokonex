# Bomberman 游戏增量部署文档

## 1. 适用范围

本文用于服务器上已经运行旧版 Bomberman 时，增量更新整个游戏项目。

覆盖范围：

- Bomberman 服务端代码和依赖。
- Bomberman 前端代码和构建产物。
- Prisma 数据库迁移。
- PM2 服务重启。
- Nginx 静态文件和反向代理检查。
- 新增设备反馈功能验证。
- 升级失败后的代码、前端和数据库回滚。

DG-LAB `socket/v2/backend` 是本次新增的独立服务，不属于旧服务增量升级。请先按 [DG-LAB WebSocket v2 后端部署文档](dglab-websocket-backend-deployment.md) 完成全新部署。

YYC-DJ 指令 WebSocket 使用固定服务 `ws://103.236.55.92:43001`，不需要在服务器上部署对应后端。

## 2. 本次推荐上线顺序

1. 全新部署 DG-LAB `socket/v2/backend`。
2. 确认得到可用的 `wss://dglab-ws.example.com` 地址。
3. 备份现有 Bomberman 代码、环境变量、数据库和 Nginx 配置。
4. 拉取 Bomberman 新版本。
5. 安装服务端和客户端依赖。
6. 补充客户端 DG-LAB WebSocket 地址。
7. 检查并执行 Prisma 迁移。
8. 运行测试和生产构建。
9. 在维护窗口重启服务端并发布前端。
10. 验证登录、房间、对局和三种设备连接方式。

不要先发布新前端、后部署 DG-LAB 后端，否则用户会看到 DG-LAB WebSocket 入口，但暂时无法连接。

## 3. 部署前确认

本文默认：

```text
项目目录：/opt/Bomberman
PM2 进程：bomberman-server
后端端口：45170
数据库：bomberman_yokonex
Git 分支：master
```

如果服务器实际配置不同，替换后续命令中的目录、进程名、端口和数据库名。

检查当前状态：

```bash
cd /opt/Bomberman
git status --short
git branch --show-current
git rev-parse HEAD
pm2 status
pm2 describe bomberman-server
sudo nginx -T | grep -nE "root |proxy_pass"
```

必须确认：

- 当前生产目录没有未确认的本地修改。
- `server/.env` 和 `client/.env` 存在。
- PM2 实际入口是当前项目目录中的服务端文件。
- Nginx 静态目录是 `/opt/Bomberman/client/dist`，或者明确知道实际发布目录。
- 数据库备份账号可以执行 `mysqldump`。

如果 `git status --short` 有输出，先备份并确认修改用途。不要使用 `git reset --hard` 清理生产修改。

## 4. 记录旧版本

创建备份目录：

```bash
sudo mkdir -p /opt/backups/bomberman-before-device-feedback
sudo chown -R "$USER":"$USER" /opt/backups/bomberman-before-device-feedback
```

记录提交号和运行信息：

```bash
cd /opt/Bomberman
git rev-parse HEAD > /opt/backups/bomberman-before-device-feedback/git-commit.txt
git status --short > /opt/backups/bomberman-before-device-feedback/git-status.txt
pm2 describe bomberman-server > /opt/backups/bomberman-before-device-feedback/pm2.txt
```

查看记录的旧提交号：

```bash
cat /opt/backups/bomberman-before-device-feedback/git-commit.txt
```

回滚时会用到该提交号。

## 5. 备份配置和数据

### 5.1 备份环境变量

```bash
cd /opt/Bomberman
cp server/.env /opt/backups/bomberman-before-device-feedback/server.env
cp client/.env /opt/backups/bomberman-before-device-feedback/client.env
```

如果客户端没有独立 `.env`，记录当前构建时使用的环境变量来源。

### 5.2 备份 Nginx

根据服务器实际文件名执行：

```bash
sudo cp /etc/nginx/conf.d/bomberman.conf /opt/backups/bomberman-before-device-feedback/bomberman.conf
```

### 5.3 备份数据库

```bash
mysqldump --single-transaction --routines --triggers -u root -p bomberman_yokonex > /opt/backups/bomberman-before-device-feedback/bomberman_yokonex.sql
```

检查备份不是空文件：

```bash
ls -lh /opt/backups/bomberman-before-device-feedback/bomberman_yokonex.sql
```

### 5.4 备份当前构建产物

```bash
cd /opt/Bomberman
cp -a server/build /opt/backups/bomberman-before-device-feedback/server-build
cp -a client/dist /opt/backups/bomberman-before-device-feedback/client-dist
```

如果目录不存在，说明旧版本可能使用了其他构建目录。先通过 `pm2 describe` 和 Nginx 配置确认，不要直接继续。

## 6. 查看待更新内容

```bash
cd /opt/Bomberman
git fetch origin
git log --oneline HEAD..origin/master
git diff --stat HEAD..origin/master
git diff --name-only HEAD..origin/master
```

重点关注：

- `server/prisma/migrations`：是否有新数据库迁移。
- `server/package-lock.json`：服务端依赖是否变化。
- `client/package-lock.json`：客户端依赖是否变化。
- `server/.env.example` 和 `client/.env.example`：是否新增环境变量。
- `docs/deployment.md`：部署方式是否变化。

本次设备反馈版本新增了客户端依赖和 `VITE_DGLAB_WS_URL`。当前设备反馈提交没有新增 Prisma 迁移，但仍应执行迁移状态检查。

## 7. 拉取代码

确认生产目录干净后：

```bash
cd /opt/Bomberman
git pull --ff-only origin master
```

记录更新后的提交：

```bash
git rev-parse HEAD
git log -3 --oneline
```

`--ff-only` 可以避免服务器上意外生成合并提交。如果命令失败，先处理分支分叉或本地修改，不要强制覆盖。

## 8. 安装依赖

服务端和客户端都有独立的锁文件：

```bash
cd /opt/Bomberman
npm --prefix server ci
npm --prefix client ci
```

不要使用 `--omit=dev`，因为生产构建仍需要 TypeScript、Vite 和 Prisma CLI 等开发依赖。

本次前端会安装二维码生成依赖 `qrcode`。

## 9. 更新环境变量

### 9.1 服务端

检查原有配置仍然存在：

```env
DATABASE_URL="mysql://root:password@127.0.0.1:3306/bomberman_yokonex"
JWT_SECRET="生产环境密钥"
AUTH_REQUIRED_FOR_ROOMS="1"
AUTH_SM4_KEY="与客户端一致的32位十六进制密钥"
AUTH_SM4_IV="与客户端一致的32位十六进制向量"
ADMIN_USERNAMES="admin"
```

不要用 `.env.example` 覆盖现有 `server/.env`。

`ADMIN_USERNAMES` 用于控制 [EMS 在线设备管理](ems-device-admin.md) 权限。升级后管理员需要重新登录，主菜单才会显示设备后台入口。

### 9.2 客户端

在现有 `client/.env` 中保留原配置，并新增 DG-LAB 地址：

```env
VITE_AUTH_SM4_KEY="与服务端一致"
VITE_AUTH_SM4_IV="与服务端一致"
VITE_BACKEND_WS_URL="wss://game.example.com"
VITE_BACKEND_HTTP_URL="https://game.example.com"
VITE_DGLAB_WS_URL="wss://dglab-ws.example.com"
```

说明：

- `VITE_DGLAB_WS_URL` 指向新部署的 DG-LAB `socket/v2/backend`。
- YYC-DJ 地址已固定在客户端代码中，不需要 `VITE_EMS_COMMAND_WS_URL`。
- Vite 变量在构建时写入产物，修改 `.env` 后必须重新构建前端。

## 10. 检查数据库迁移

先生成 Prisma Client：

```bash
cd /opt/Bomberman
npm --prefix server run prisma:generate
```

检查迁移状态：

```bash
npm --prefix server exec prisma migrate status
```

如果存在待执行迁移：

```bash
npm --prefix server exec prisma migrate deploy
```

生产环境不要执行 `prisma migrate dev`。

Prisma 不会自动生成数据库降级脚本。任何迁移执行前都必须完成数据库备份。

## 11. 测试和构建

运行服务端测试：

```bash
cd /opt/Bomberman
npm --prefix server test
```

构建服务端和客户端：

```bash
npm run build
```

检查产物：

```bash
test -f server/build/index.js
test -f client/dist/index.html
ls -lh server/build/index.js client/dist/index.html
```

只有测试和构建成功后，才进入正式切换。

## 12. 正式切换

### 12.1 维护窗口

服务端重启会断开当前房间和对局。建议提前通知用户，并等待进行中的对局结束。

### 12.2 重启后端

如果 PM2 已正确指向 `server/build/index.js`：

```bash
cd /opt/Bomberman
PORT=45170 pm2 restart bomberman-server --update-env
pm2 logs bomberman-server --lines 100
```

如果旧 PM2 入口不是 `server/build/index.js`，需要重新创建：

```bash
pm2 stop bomberman-server
pm2 delete bomberman-server
cd /opt/Bomberman
PORT=45170 pm2 start server/build/index.js --name bomberman-server
pm2 save
```

### 12.3 发布前端

如果 Nginx 的 `root` 是：

```text
/opt/Bomberman/client/dist
```

构建完成后已经生效，不需要复制。

如果 Nginx 使用独立目录：

```text
/var/www/bomberman/client
```

执行：

```bash
sudo mkdir -p /var/www/bomberman/client
sudo rsync -a /opt/Bomberman/client/dist/ /var/www/bomberman/client/
```

本次更新不要求修改 Bomberman 的 Nginx 规则。如果实际修改过 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 13. 上线验证

### 13.1 服务端

```bash
pm2 status
curl http://127.0.0.1:45170/hello
pm2 logs bomberman-server --lines 100
```

### 13.2 数据库

```bash
cd /opt/Bomberman
npm --prefix server exec prisma migrate status
```

结果应显示数据库已经是最新状态。

### 13.3 游戏主流程

1. 打开游戏首页。
2. 注册或登录。
3. 创建房间。
4. 两名玩家加入并准备。
5. 完成一局游戏。
6. 查看战绩、积分和排行榜。
7. 检查浏览器控制台没有持续报错。

### 13.4 设备反馈

至少验证：

1. 原有 YYC-DJ BLE 设备仍能连接。
2. DG-LAB 郊狼 2.0 或 3.0 能通过 BLE 连接。
3. DG-LAB 郊狼 3.0 能通过新 WebSocket 服务扫码连接。
4. YYC-DJ 指令 WebSocket 能使用 UID、Token 登录。
5. 放炸弹、爆炸、死亡、胜负和道具事件能触发对应反馈。
6. 每个事件都能按 [commandId 映射](command-id-event-mapping.md) 发送对应指令。
7. 断开或切换设备后强度能够归零。

## 14. 回滚

### 14.1 立即回滚代码

先停止当前服务：

```bash
pm2 stop bomberman-server
```

查看旧提交号：

```bash
cat /opt/backups/bomberman-before-device-feedback/git-commit.txt
```

确认工作区没有未提交修改后，切回旧提交：

```bash
cd /opt/Bomberman
git switch --detach <旧提交号>
npm --prefix server ci
npm --prefix client ci
npm run build
PORT=45170 pm2 restart bomberman-server --update-env
```

如果无法重新构建，可以临时恢复备份产物：

```bash
mv /opt/Bomberman/server/build /opt/Bomberman/server/build.failed
mv /opt/Bomberman/client/dist /opt/Bomberman/client/dist.failed
cp -a /opt/backups/bomberman-before-device-feedback/server-build /opt/Bomberman/server/build
cp -a /opt/backups/bomberman-before-device-feedback/client-dist /opt/Bomberman/client/dist
PORT=45170 pm2 restart bomberman-server --update-env
```

执行移动前必须再次确认路径是 `/opt/Bomberman/server/build` 和 `/opt/Bomberman/client/dist`。如果 `.failed` 目录已经存在，先改用新的备份名称。

### 14.2 回滚独立前端目录

如果 Nginx 使用 `/var/www/bomberman/client`：

```bash
sudo rsync -a /opt/backups/bomberman-before-device-feedback/client-dist/ /var/www/bomberman/client/
```

### 14.3 回滚数据库

只有新迁移导致旧代码无法运行时，才恢复数据库备份。恢复会覆盖升级后的新增数据，应先停止服务并确认影响：

```bash
pm2 stop bomberman-server
mysql -u root -p bomberman_yokonex < /opt/backups/bomberman-before-device-feedback/bomberman_yokonex.sql
PORT=45170 pm2 restart bomberman-server --update-env
```

本次设备反馈版本没有新增 Prisma 迁移，通常不需要回滚数据库。

### 14.4 DG-LAB 新服务

如果游戏回滚到不包含 DG-LAB WebSocket 的旧版本，新部署的 `dglab-socket` 可以暂时保留。旧游戏不会连接它。

如需停止：

```bash
pm2 stop dglab-socket
```

YYC-DJ 使用外部固定服务，不受 Bomberman 服务器回滚影响。

## 15. 本次更新的精简命令

完成备份和 DG-LAB 新服务部署后，可以按以下顺序执行：

```bash
cd /opt/Bomberman
git status --short
git pull --ff-only origin master
npm --prefix server ci
npm --prefix client ci
npm --prefix server run prisma:generate
npm --prefix server exec prisma migrate status
npm --prefix server exec prisma migrate deploy
npm --prefix server test
npm run build
PORT=45170 pm2 restart bomberman-server --update-env
pm2 logs bomberman-server --lines 100
curl http://127.0.0.1:45170/hello
```

精简命令不能代替备份、环境变量检查和上线验证。
