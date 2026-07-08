import smCrypto from "sm-crypto";

import { AuthError } from "./authService";

type EncryptedAuthRequest = {
  encrypted?: string;
  payload?: string;
};

const DEFAULT_SM4_KEY = "0123456789abcdeffedcba9876543210";
const DEFAULT_SM4_IV = "fedcba98765432100123456789abcdef";
const { sm4 } = smCrypto;

export function decryptAuthPayload(input: EncryptedAuthRequest) {
  if (input.encrypted !== "sm4" || !input.payload) {
    throw new AuthError(400, "认证请求必须使用SM4加密");
  }

  try {
    const key = normalizeHexSecret(process.env.AUTH_SM4_KEY, DEFAULT_SM4_KEY);
    const iv = normalizeHexSecret(process.env.AUTH_SM4_IV, DEFAULT_SM4_IV);
    const decrypted = sm4.decrypt(input.payload, key, { mode: "cbc", iv });
    const payload = JSON.parse(String(decrypted));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("invalid payload");
    }

    // 解密后再交给原有注册/登录逻辑，校验规则保持不变。
    return payload as Record<string, string>;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError(400, "认证请求解密失败");
  }
}

function normalizeHexSecret(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return /^[0-9a-fA-F]{32}$/.test(text) ? text : fallback;
}
