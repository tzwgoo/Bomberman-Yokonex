# commandId 与游戏事件映射

## 1. 适用范围

本文说明 Bomberman 游戏事件与 YYC-DJ 指令 WebSocket `commandId` 的映射关系。

该映射仅用于 `command_websocket` 连接方式。BLE 和 DG-LAB WebSocket 使用事件中的强度、通道和持续时间，不发送 `commandId`。

## 2. 映射表

| 游戏事件 | 事件标识 | commandId | 触发条件 |
| --- | --- | --- | --- |
| 放炸弹 | `bomb_placed` | `bomb_placed` | 当前玩家放置的炸弹进入房间状态时触发 |
| 爆炸 | `bomb_exploded` | `bomb_exploded` | 当前玩家放置的炸弹从房间状态移除时触发 |
| 死亡 | `death` | `death` | 当前玩家从存活状态变为死亡状态时触发 |
| 胜利 | `round_win` | `round_win` | 本局存在胜者，且胜者是当前玩家时触发 |
| 失败 | `round_lose` | `round_lose` | 本局存在胜者，且胜者不是当前玩家时触发 |
| 捡普通道具 | `power_up` | `power_up` | 服务端通知当前玩家拾取普通道具时触发 |
| 低强度脉冲道具 | `ems_low` | `power_up_ems_low` | 其他玩家拾取低强度脉冲道具时触发，拾取者不触发 |
| 中强度脉冲道具 | `ems_medium` | `power_up_ems_medium` | 其他玩家拾取中强度脉冲道具时触发，拾取者不触发 |
| 高强度脉冲道具 | `ems_high` | `power_up_ems_high` | 其他玩家拾取高强度脉冲道具时触发，拾取者不触发 |

平局没有对应的 `commandId`，不会发送胜利或失败指令。

## 3. 发送条件

对局中的事件满足以下全部条件时才会自动发送：

1. “启用反馈”已经开启。
2. 普通事件需要启用对应反馈规则；三种脉冲道具由服务端直接触发，不使用普通“捡道具”规则开关。
3. 连接方式为 YYC-DJ 指令 WebSocket。
4. WebSocket 已连接，并已使用 UID、Token 完成 IM 登录。

事件会进入同一个发送队列，按触发顺序执行。未连接、未开启全局反馈或平局不会自动发送指令。“测试”按钮用于人工验证普通事件，不受事件启用开关限制。三种脉冲道具需要在多人对局中实际拾取验证。

## 4. WebSocket 报文

客户端连接固定地址：

```text
ws://103.236.55.92:43001
```

登录成功后，客户端使用服务端返回的 `userId` 发送指令：

```json
{
  "type": "sendCommand",
  "userId": "123456",
  "commandId": "bomb_exploded"
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `type` | 固定为 `sendCommand` |
| `userId` | IM 登录成功后由服务端返回的用户 ID |
| `commandId` | 使用上方映射表中与游戏事件对应的值 |

指令 WebSocket 只发送事件映射，不发送 A/B 通道强度或持续时间。

## 5. 配置与兼容说明

- 新配置默认使用上方映射。
- 对战大厅不显示 `commandId` 输入框，避免误改映射。
- 为兼容已经保存的客户端配置，原有 `commandId` 会继续保存在浏览器本地配置中。
- 如果浏览器曾经保存过自定义 `commandId`，实际发送值仍以该浏览器保存的旧值为准。
- 清除站点本地存储后重新进入游戏，会恢复上方默认映射，同时也会清除该站点保存的其他本地设置和登录状态。

默认映射定义在 `client/src/emsFeedback.ts` 的 `DEFAULT_RULES` 中，发送逻辑位于 `sendCommandId` 方法。

## 6. 验证方式

1. 在首页选择 YYC-DJ 指令 WebSocket，填写 UID、Token 并连接。
2. 在对战大厅开启“启用反馈”和需要测试的事件。
3. 点击事件右上角的“测试”，或在对局中实际触发事件。
4. 检查 WebSocket 服务返回的 `commandResult`，确认 `commandId` 与映射表一致。
5. 分别验证胜利、失败和平局，确认平局不发送结果指令。
6. 分别拾取三种脉冲道具，确认拾取者不发送指令，其他玩家依次发送 `power_up_ems_low`、`power_up_ems_medium`、`power_up_ems_high`。
