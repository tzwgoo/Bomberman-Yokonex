# EMS 在线设备管理

## 1. 功能范围

设备后台用于管理当前已进入 Bomberman 房间的登录玩家。

支持：

- 查看在线玩家、房间、设备连接方式、状态和电量。
- 向指定玩家发送六类游戏事件测试。
- 远程断开指定玩家的 EMS 设备。
- 查看连接、命令下发和客户端执行结果日志。

BLE、DG-LAB 和 YYC-DJ 设备都由玩家浏览器实际执行操作。玩家必须保持游戏页面、房间连接和设备连接。

当前在线设备索引保存在单个服务端进程内。使用多个游戏服务进程时，需要改为 Redis 等共享状态，本版本不支持跨进程设备控制。

## 2. 配置管理员

在 `server/.env` 中增加允许访问设备后台的账号名，多个账号用英文逗号分隔：

```env
ADMIN_USERNAMES="admin,operator"
```

账号名不区分大小写。只有已登录并且用户名在该名单中的用户可以访问 `/admin/` 接口。

修改后重启服务端：

```bash
pm2 restart bomberman-server --update-env
```

管理员需要重新登录游戏，让客户端取得最新的 `isAdmin` 标记。重新登录后，主菜单会显示“设备后台”。

## 3. 数据库迁移

设备日志保存在 `ems_device_logs` 表。部署新版本后执行：

```bash
cd /opt/Bomberman
npm --prefix server run prisma:generate
npm --prefix server exec prisma migrate deploy
```

日志不会保存 UID、Token、密码或完整设备凭据。

## 4. Nginx 代理

前后端使用同一个域名或端口时，需要把 `/admin/` 转发到游戏服务端：

```nginx
location /admin/ {
    proxy_pass http://127.0.0.1:45170;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

修改后检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. 使用方式

1. 使用管理员账号重新登录游戏。
2. 从主菜单进入“设备后台”。
3. 让目标玩家进入房间并完成设备连接。
4. 在在线玩家卡片中发送事件或断开设备。
5. 在最近日志中检查命令是否下发，以及客户端是否执行成功。

六类事件映射见 [commandId 与游戏事件映射](command-id-event-mapping.md)。

## 6. 安全限制

- 服务端接口会再次校验管理员账号，隐藏菜单不能替代权限控制。
- 后台只能控制当前在线玩家，不能唤醒已关闭页面的 BLE 设备。
- 所有设备操作都会记录管理员用户 ID、目标用户 ID、房间、事件和结果。
- 不要把 `ADMIN_USERNAMES` 配置为普通玩家账号。
- 建议设备后台仅通过 HTTPS 访问，并限制管理账号的密码和使用范围。
