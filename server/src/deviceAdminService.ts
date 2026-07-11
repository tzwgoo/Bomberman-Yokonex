import { randomUUID } from "node:crypto";
import type { Client } from "colyseus";

import { isDatabaseConfigured, prisma } from "./db.js";

export const EMS_ADMIN_EVENT_TYPES = [
  "bomb_placed",
  "bomb_exploded",
  "death",
  "round_win",
  "round_lose",
  "power_up",
] as const;

export type EmsAdminEventType = typeof EMS_ADMIN_EVENT_TYPES[number];
export type EmsAdminCommand = {
  requestId: string;
  action: "event" | "disconnect";
  eventType?: EmsAdminEventType;
};

type DeviceStateInput = {
  connected?: boolean;
  transport?: string;
  status?: string;
  batteryLevel?: number;
};

type OnlineDevice = {
  userId: string;
  username: string;
  nickname: string;
  roomId: string;
  sessionId: string;
  connected: boolean;
  transport: string;
  status: string;
  batteryLevel: number;
  updatedAt: string;
  send: (command: EmsAdminCommand) => void;
};

type PendingCommand = {
  adminUserId: string;
  userId: string;
  roomId: string;
  action: string;
  eventType?: EmsAdminEventType;
};

type DeviceLogInput = {
  userId: string;
  adminUserId?: string;
  roomId?: string;
  category: "connection" | "command" | "result";
  action: string;
  transport?: string;
  status?: string;
  success?: boolean;
  message?: string;
  detail?: Record<string, string>;
};

export class DeviceAdminError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const onlineDevices = new Map<string, OnlineDevice>();
const pendingCommands = new Map<string, PendingCommand>();
const lastCommandAt = new Map<string, number>();
const memoryLogs: Array<DeviceLogInput & { id: string; createdAt: string }> = [];

export function registerOnlineDevice(input: {
  userId: string;
  username: string;
  nickname: string;
  roomId: string;
  sessionId: string;
  client: Client;
}) {
  if (!input.userId) {
    return;
  }

  onlineDevices.set(input.userId, {
    userId: input.userId,
    username: input.username,
    nickname: input.nickname,
    roomId: input.roomId,
    sessionId: input.sessionId,
    connected: false,
    transport: "",
    status: "未连接",
    batteryLevel: -1,
    updatedAt: new Date().toISOString(),
    send: (command) => input.client.send("adminEmsCommand", command),
  });
}

export function updateOnlineDevice(userId: string, roomId: string, sessionId: string, client: Client, input: DeviceStateInput) {
  const current = onlineDevices.get(userId);
  if (!current || current.roomId !== roomId || current.sessionId !== sessionId) {
    return;
  }

  const wasConnected = current.connected;
  const previousTransport = current.transport;
  current.connected = Boolean(input.connected);
  current.transport = normalizeText(input.transport, 32);
  current.status = normalizeText(input.status, 120) || (current.connected ? "已连接" : "未连接");
  current.batteryLevel = normalizeBattery(input.batteryLevel);
  current.updatedAt = new Date().toISOString();
  current.send = (command) => client.send("adminEmsCommand", command);

  if (wasConnected !== current.connected || previousTransport !== current.transport) {
    void writeDeviceLog({
      userId,
      roomId,
      category: "connection",
      action: current.connected ? "connected" : "disconnected",
      transport: current.transport,
      status: current.status,
      success: current.connected,
    });
  }
}

export function unregisterOnlineDevice(userId: string, roomId: string, sessionId: string) {
  const current = onlineDevices.get(userId);
  if (!current || current.roomId !== roomId || current.sessionId !== sessionId) {
    return;
  }

  onlineDevices.delete(userId);
  lastCommandAt.delete(userId);
  if (current.connected) {
    void writeDeviceLog({
      userId,
      roomId,
      category: "connection",
      action: "offline",
      transport: current.transport,
      status: "玩家已离线",
      success: false,
    });
  }
}

export function listOnlineDevices() {
  return Array.from(onlineDevices.values())
    .map(({ send: _send, ...device }) => device)
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.nickname.localeCompare(b.nickname, "zh-CN"));
}

export async function sendDeviceAdminCommand(adminUserId: string, userId: string, input: {
  action?: string;
  eventType?: string;
}) {
  const device = onlineDevices.get(userId);
  if (!device) {
    throw new DeviceAdminError(404, "用户当前不在线");
  }
  if (!device.connected) {
    throw new DeviceAdminError(409, "用户设备未连接");
  }

  const now = Date.now();
  if (now - (lastCommandAt.get(userId) ?? 0) < 500) {
    throw new DeviceAdminError(429, "设备操作过于频繁，请稍后再试");
  }
  lastCommandAt.set(userId, now);

  const action = input.action === "disconnect" ? "disconnect" : "event";
  const eventType = action === "event" ? normalizeEventType(input.eventType) : undefined;
  const requestId = randomUUID();
  const command: EmsAdminCommand = { requestId, action, eventType };
  pendingCommands.set(requestId, { adminUserId, userId, roomId: device.roomId, action, eventType });
  const pendingTimer = setTimeout(() => pendingCommands.delete(requestId), 30000);
  pendingTimer.unref();
  device.send(command);

  await writeDeviceLog({
    userId,
    adminUserId,
    roomId: device.roomId,
    category: "command",
    action,
    transport: device.transport,
    status: "已下发",
    detail: eventType ? { requestId, eventType } : { requestId },
  });
  return { requestId };
}

export function recordDeviceAdminResult(userId: string, input: {
  requestId?: string;
  success?: boolean;
  message?: string;
}) {
  const requestId = normalizeText(input.requestId, 64);
  const pending = pendingCommands.get(requestId);
  if (!pending || pending.userId !== userId) {
    return;
  }

  pendingCommands.delete(requestId);
  void writeDeviceLog({
    userId,
    adminUserId: pending.adminUserId,
    roomId: pending.roomId,
    category: "result",
    action: pending.action,
    success: Boolean(input.success),
    message: normalizeText(input.message, 191),
    detail: pending.eventType ? { requestId, eventType: pending.eventType } : { requestId },
  });
}

export async function listDeviceLogs(limit = 100) {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit) || 100));
  if (!isDatabaseConfigured()) {
    return memoryLogs.slice(0, safeLimit);
  }

  return prisma.emsDeviceLog.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
}

function normalizeEventType(value?: string): EmsAdminEventType {
  if (EMS_ADMIN_EVENT_TYPES.includes(value as EmsAdminEventType)) {
    return value as EmsAdminEventType;
  }
  throw new DeviceAdminError(400, "不支持的设备事件");
}

async function writeDeviceLog(input: DeviceLogInput) {
  memoryLogs.unshift({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
  memoryLogs.splice(200);
  if (!isDatabaseConfigured()) {
    return;
  }

  try {
    await prisma.emsDeviceLog.create({ data: input });
  } catch (error) {
    console.error("EMS device log write failed", error);
  }
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeBattery(value: unknown) {
  const level = Number(value);
  return Number.isFinite(level) ? Math.max(-1, Math.min(100, Math.trunc(level))) : -1;
}
