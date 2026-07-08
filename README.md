# Bomberman Yokonex

基于 `Phaser + Colyseus` 的多人炸弹人原型。

当前第一步只做底座：

- `client`：Phaser 客户端
- `server`：Colyseus 服务端
- 多房间能力先沿用 Colyseus Room
- 炸弹人玩法后续参考 `DmytroVasin/bomber`
- 房间大厅后续参考 `UniCT-WebDevelopment/Bomberman`

## 运行

安装依赖：

```bash
npm run install:all
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

- 服务端：http://localhost:2567
- 客户端：http://localhost:1234
- Colyseus 监控：http://localhost:2567/monitor

## 第一阶段目标

1. 跑通 Phaser + Colyseus 基础连接
2. 建立炸弹人房间协议
3. 增加房间大厅
4. 增加移动端虚拟摇杆和放炸弹按钮
5. 接入硬件反馈事件层

## 参考项目

见 [docs/references.md](docs/references.md)。

## 后续计划

见 [docs/development-plan.md](docs/development-plan.md)。

## 部署

见 [docs/deployment.md](docs/deployment.md)。
