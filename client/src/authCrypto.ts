import smCrypto from "sm-crypto";

type EncryptedAuthPayload = {
    encrypted: "sm4";
    payload: string;
};

const DEFAULT_SM4_KEY = "0123456789abcdeffedcba9876543210";
const DEFAULT_SM4_IV = "fedcba98765432100123456789abcdef";
const { sm4 } = smCrypto;

export function encryptAuthPayload(payload: Record<string, string>): EncryptedAuthPayload {
    const key = normalizeHexSecret(import.meta.env.VITE_AUTH_SM4_KEY, DEFAULT_SM4_KEY);
    const iv = normalizeHexSecret(import.meta.env.VITE_AUTH_SM4_IV, DEFAULT_SM4_IV);

    // 注册和登录请求只发送密文，避免账号密码直接出现在请求体里。
    return {
        encrypted: "sm4",
        payload: sm4.encrypt(JSON.stringify(payload), key, { mode: "cbc", iv }) as string,
    };
}

function normalizeHexSecret(value: unknown, fallback: string) {
    const text = String(value ?? "").trim();
    return /^[0-9a-fA-F]{32}$/.test(text) ? text : fallback;
}
