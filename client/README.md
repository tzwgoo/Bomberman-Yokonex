# Bomberman Client

Bomberman 的 Phaser 客户端。

负责登录页、作战大厅、房间界面、地图选择、实时对战画面、个人信息和排行榜展示。

## 技术栈

- Phaser
- Vite
- TypeScript
- Colyseus SDK

## 主要能力

- 登录 / 注册第一屏
- 登录成功后进入作战大厅
- 退出登录并清除本地登录态
- 创建房间、加入房间、查看房间列表
- 房间密码、人数上限、准备状态和开局倒计时
- 随机匹配
- 地图选择和地图预览
- 实时移动、放炸弹、爆炸、道具和结算展示
- 个人资料编辑
- 个人战绩、积分、段位和排名展示
- 排行榜页面
- 移动端虚拟摇杆和放炸弹按钮
- 音效开关

## 后端地址

客户端地址在 `src/backend.ts` 中自动判断：

```txt
localhost 访问：连接 ws://localhost:2567
非 localhost 访问：连接当前域名
```

本地开发时，先启动服务端，再启动客户端。

如果生产环境要拆成不同域名，比如：

```txt
app.example.com
api.example.com
```

需要先把后端地址改成环境变量配置。

## 启动

安装依赖：

```bash
npm install
```

开发模式：

```bash
npm start
```

默认地址：

```txt
http://localhost:1234
```

构建：

```bash
npm run build
```

预览构建结果：

```bash
npm run preview
```

构建产物：

```txt
dist
```

## 主要文件

- `src/index.ts`：客户端入口
- `src/scenes/BombermanScene.ts`：主菜单、作战大厅、房间和对战主场景
- `src/scenes/ProfileScene.ts`：个人信息页
- `src/scenes/LeaderboardScene.ts`：排行榜页
- `src/authStore.ts`：登录态存储
- `src/profileStore.ts`：个人资料存储
- `src/bombermanMaps.ts`：客户端地图选项
- `src/backend.ts`：后端地址配置
- `src/soundManager.ts`：音效管理

## 验证

项目提交前建议从仓库根目录运行：

```bash
npm run build
npm --prefix server test
```
