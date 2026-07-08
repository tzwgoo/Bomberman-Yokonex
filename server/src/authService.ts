import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";

import { isDatabaseConfigured, jwtSecret, prisma } from "./db";

export type AuthUserDto = {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  color: string | null;
  roleId: string | null;
  characterKey: string | null;
  currentScore: number;
};

export type AuthRoomUser = {
  userId: string;
  username: string;
  nickname: string;
};

export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function registerUser(input: { username?: string; password?: string; nickname?: string }) {
  ensureDatabaseReady();
  const username = normalizeUsername(input.username);
  const password = normalizePassword(input.password);
  const nickname = normalizeNickname(input.nickname || username);
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        nickname,
        avatar: "🙂",
        color: "#f6c453",
        roleId: "rookie",
        characterKey: "rookie",
      },
    });

    return createAuthResponse(user);
  } catch (error) {
    if (isUniqueError(error)) {
      throw new AuthError(409, "用户名已存在");
    }

    throw error;
  }
}

export async function loginUser(input: { username?: string; password?: string }) {
  ensureDatabaseReady();
  const username = normalizeUsername(input.username);
  const password = normalizePassword(input.password);
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthError(401, "用户名或密码错误");
  }

  return createAuthResponse(user);
}

export async function getUserByToken(token?: string) {
  const roomUser = verifyAuthToken(token);
  if (!roomUser || !isDatabaseConfigured()) {
    return null;
  }

  return prisma.user.findUnique({ where: { id: roomUser.userId } });
}

export function verifyAuthToken(token?: string): AuthRoomUser | null {
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, jwtSecret());
    if (!payload || typeof payload === "string" || typeof payload.sub !== "string") {
      return null;
    }

    return {
      userId: payload.sub,
      username: String(payload.username ?? ""),
      nickname: String(payload.nickname ?? ""),
    };
  } catch {
    return null;
  }
}

export async function updateUserProfile(userId: string, input: {
  nickname?: string;
  avatar?: string;
  color?: string;
  roleId?: string;
  characterKey?: string;
}) {
  ensureDatabaseReady();

  // 只允许客户端更新展示资料，账号名和密码不在这个接口里改。
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      nickname: normalizeNickname(input.nickname),
      avatar: trimOptional(input.avatar, 24),
      color: normalizeColor(input.color),
      roleId: trimOptional(input.roleId, 32),
      characterKey: trimOptional(input.characterKey, 32),
    },
  });

  return serializeUser(user);
}

export function createAuthResponse(user: User) {
  const safeUser = serializeUser(user);
  const token = jwt.sign(
    {
      username: user.username,
      nickname: user.nickname,
    },
    jwtSecret(),
    {
      subject: user.id,
      expiresIn: "7d",
    },
  );

  return { token, user: safeUser };
}

export function serializeUser(user: User): AuthUserDto {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    color: user.color,
    roleId: user.roleId,
    characterKey: user.characterKey,
    currentScore: user.currentScore,
  };
}

function ensureDatabaseReady() {
  if (!isDatabaseConfigured()) {
    throw new AuthError(503, "数据库未配置");
  }
}

function normalizeUsername(username?: string) {
  const value = String(username ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(value)) {
    throw new AuthError(400, "用户名只能使用 3-24 位小写字母、数字或下划线");
  }

  return value;
}

function normalizePassword(password?: string) {
  const value = String(password ?? "");
  if (value.length < 6 || value.length > 64) {
    throw new AuthError(400, "密码长度需要 6-64 位");
  }

  return value;
}

function normalizeNickname(nickname?: string) {
  return String(nickname ?? "").trim().slice(0, 16) || "玩家";
}

function normalizeColor(color?: string) {
  const value = trimOptional(color, 16);
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

function trimOptional(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim().slice(0, maxLength);
  return text || undefined;
}

function isUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
