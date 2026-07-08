# Bomberman Server

Bomberman 的 Colyseus 服务端。

负责实时房间、对局结算、登录注册、用户资料、战绩落库、积分段位和排行榜。

## 技术栈

- Colyseus
- Express
- TypeScript
- MySQL 8
- Prisma
- JWT
- bcrypt

## 主要能力

- `bomberman_room` 实时对战房间
- 房间列表、创建房间、加入房间
- 房间密码、人数上限、准备状态、开局倒计时
- 房主转让和踢人
- 地图白名单和随机地图
- 服务端权威结算对局结果
- 注册、登录和登录态校验
- 用户资料保存
- 对局记录保存
- 积分、段位、排名和排行榜

## 环境变量

复制模板：

```bash
copy .env.example .env
```

Linux / macOS：

```bash
cp .env.example .env
```

示例：

```env
DATABASE_URL="mysql://root:password@localhost:3306/bomberman_yokonex"
JWT_SECRET="replace-this-with-a-long-random-secret"
AUTH_REQUIRED_FOR_ROOMS="0"
```

说明：

- `DATABASE_URL`：MySQL 连接地址。
- `JWT_SECRET`：JWT 签名密钥，生产环境必须改成强随机字符串。
- `AUTH_REQUIRED_FOR_ROOMS`：设为 `1` 时，未登录用户不能进入房间。

## 数据库

创建数据库：

```sql
CREATE DATABASE bomberman_yokonex
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

生成 Prisma Client：

```bash
npm run prisma:generate
```

执行开发迁移：

```bash
npm run prisma:migrate
```

生产环境迁移：

```bash
npm exec prisma migrate deploy
```

## 启动

开发模式：

```bash
npm start
```

默认端口：

```txt
45170
```

构建：

```bash
npm run build
```

构建产物：

```txt
build
```

## 常用接口

- `POST /auth/register`：注册
- `POST /auth/login`：登录
- `GET /me`：查询当前用户
- `PUT /me/profile`：更新个人资料
- `GET /me/stats`：查询个人战绩和积分
- `GET /leaderboard`：查询排行榜
- `GET /rooms/bomberman`：查询房间列表
- `GET /maps/bomberman`：查询地图列表
- `GET /monitor`：Colyseus 监控

需要登录的接口使用：

```txt
Authorization: Bearer <token>
```

## 积分重算

根据历史对局重算积分：

```bash
npm run ratings:rebuild
```

## 测试

```bash
npm test
```

项目提交前建议从仓库根目录运行：

```bash
npm run build
npm --prefix server test
```
