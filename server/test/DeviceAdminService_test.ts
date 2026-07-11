import assert from "node:assert";
import type { Client } from "colyseus";

import { isAdminUsername } from "../src/authService";
import {
  listOnlineDevices,
  recordDeviceAdminResult,
  registerOnlineDevice,
  sendDeviceAdminCommand,
  unregisterOnlineDevice,
  updateOnlineDevice,
} from "../src/deviceAdminService";

describe("EMS device admin", () => {
  it("uses the configured admin username allowlist", () => {
    const previous = process.env.ADMIN_USERNAMES;
    process.env.ADMIN_USERNAMES = "admin, Operator ";
    try {
      assert.strictEqual(isAdminUsername("ADMIN"), true);
      assert.strictEqual(isAdminUsername("operator"), true);
      assert.strictEqual(isAdminUsername("player"), false);
    } finally {
      if (previous === undefined) {
        delete process.env.ADMIN_USERNAMES;
      } else {
        process.env.ADMIN_USERNAMES = previous;
      }
    }
  });

  it("indexes an online device and sends a targeted command", async () => {
    const sent: Array<{ type: string; payload: any }> = [];
    const client = {
      send(type: string, payload: unknown) {
        sent.push({ type, payload });
      },
    } as Client;

    registerOnlineDevice({
      userId: "user-1",
      username: "player1",
      nickname: "玩家一",
      roomId: "room-1",
      sessionId: "session-1",
      client,
    });
    updateOnlineDevice("user-1", "room-1", "session-1", client, {
      connected: true,
      transport: "ble",
      status: "已连接",
      batteryLevel: 80,
    });

    const devices = listOnlineDevices();
    assert.strictEqual(devices.length, 1);
    assert.strictEqual(devices[0].connected, true);
    assert.strictEqual(devices[0].batteryLevel, 80);

    const result = await sendDeviceAdminCommand("admin-1", "user-1", {
      action: "event",
      eventType: "bomb_exploded",
    });
    assert.strictEqual(sent[0].type, "adminEmsCommand");
    assert.strictEqual(sent[0].payload.requestId, result.requestId);
    assert.strictEqual(sent[0].payload.eventType, "bomb_exploded");

    recordDeviceAdminResult("user-1", { requestId: result.requestId, success: true, message: "完成" });
    unregisterOnlineDevice("user-1", "room-1", "session-1");
    assert.strictEqual(listOnlineDevices().length, 0);
  });
});
