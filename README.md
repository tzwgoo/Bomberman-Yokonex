# Bomberman

基于 `Phaser + Colyseus` 的多人炸弹人对战项目。

当前项目已经包含联机房间、地图选择、登录注册、MySQL 数据持久化、个人战绩、积分段位和排行榜基础能力。

## 技术栈

- 客户端：Phaser、Vite、TypeScript
- 服务端：Colyseus、Express、TypeScript
- 数据库：MySQL 8
- ORM：Prisma
- 登录：JWT、bcrypt

## 功能

- 登录 / 注册
- 登录态保存
- 作战大厅
- 创建房间 / 加入房间 / 房间列表
- 房间密码、人数上限、房主转让、踢人
- 准备状态和开局倒计时
- 随机匹配
- 多张地图和随机地图
- 炸弹、爆炸、障碍物、道具、回合结算
- 对局结果落库
- 个人资料和历史战绩
- 积分、段位、排名和排行榜

## 目录

```txt
client   Phaser 客户端
server   Colyseus 服务端
docs     开发计划、参考资料和部署文档
```

## 本地运行

安装依赖：

```bash
npm run install:all
```

复制服务端环境变量：

```bash
copy server\.env.example server\.env
```

Linux / macOS：

```bash
cp server/.env.example server/.env
```

修改 `server/.env`：

```env
DATABASE_URL="mysql://root:password@localhost:3306/bomberman_yokonex"
JWT_SECRET="replace-this-with-a-long-random-secret"
AUTH_REQUIRED_FOR_ROOMS="0"
```

初始化数据库：

```bash
npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate
```

启动服务端：

```bash
npm run dev:server
```

启动客户端：

```bash
npm run dev:client
```

默认地址：

- 服务端：http://localhost:45170
- 客户端：http://localhost:45179
- Colyseus 监控：http://localhost:45170/monitor

## 常用命令

```bash
npm run build
npm --prefix server test
npm --prefix server run ratings:rebuild
```

说明：

- `npm run build`：构建服务端和客户端。
- `npm --prefix server test`：运行服务端测试。
- `npm --prefix server run ratings:rebuild`：根据历史对局重算积分。

## 数据库

本地创建 MySQL 数据库：

```sql
CREATE DATABASE bomberman_yokonex
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

主要数据：

- `users`：用户和个人资料
- `matches`：对局记录
- `match_players`：对局玩家记录
- 积分相关字段和流水：用于段位、排名和排行榜

## 开发文档

- 开发计划：[docs/development-plan.md](docs/development-plan.md)
- 部署文档：[docs/deployment.md](docs/deployment.md)
- 游戏增量部署：[docs/incremental-deployment.md](docs/incremental-deployment.md)
- DG-LAB WebSocket 后端部署：[docs/dglab-websocket-backend-deployment.md](docs/dglab-websocket-backend-deployment.md)
- commandId 与游戏事件映射：[docs/command-id-event-mapping.md](docs/command-id-event-mapping.md)
- EMS 在线设备管理：[docs/ems-device-admin.md](docs/ems-device-admin.md)
- 参考项目：[docs/references.md](docs/references.md)

## 部署

部署方式见 [docs/deployment.md](docs/deployment.md)。

建议生产环境：

- Node.js 22
- MySQL 8
- Nginx
- PM2
- 同域部署客户端和服务端，减少 WebSocket 跨域问题

## 验证

提交前建议运行：

```bash
npm run build
npm --prefix server test
```
