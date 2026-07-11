import type { Application, Request, Response } from "express";

import { getUserByToken, isAdminUsername } from "./authService.js";
import { DeviceAdminError, listDeviceLogs, listOnlineDevices, sendDeviceAdminCommand } from "./deviceAdminService.js";

type AdminRequest = Request & { adminUserId?: string };

export function registerDeviceAdminRoutes(app: Application) {
  app.get("/admin/devices", requireAdmin, asyncRoute(async (_req, res) => {
    res.json({ devices: listOnlineDevices() });
  }));

  app.get("/admin/device-logs", requireAdmin, asyncRoute(async (req, res) => {
    res.json({ logs: await listDeviceLogs(Number(req.query.limit ?? 100)) });
  }));

  app.post("/admin/devices/:userId/commands", requireAdmin, asyncRoute(async (req: AdminRequest, res) => {
    res.json(await sendDeviceAdminCommand(req.adminUserId!, req.params.userId, req.body ?? {}));
  }));
}

async function requireAdmin(req: AdminRequest, res: Response, next: (error?: unknown) => void) {
  const user = await getUserByToken(bearerToken(req));
  if (!user) {
    res.status(401).json({ message: "请先登录" });
    return;
  }
  if (!isAdminUsername(user.username)) {
    res.status(403).json({ message: "无设备管理权限" });
    return;
  }

  req.adminUserId = user.id;
  next();
}

function asyncRoute(handler: (req: AdminRequest, res: Response) => Promise<void>) {
  return (req: AdminRequest, res: Response) => {
    handler(req, res).catch((error) => {
      if (error instanceof DeviceAdminError) {
        res.status(error.status).json({ message: error.message });
        return;
      }
      console.error("Device admin route error", error);
      res.status(500).json({ message: "服务异常" });
    });
  };
}

function bearerToken(req: Request) {
  const value = req.headers.authorization ?? "";
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length) : "";
}
