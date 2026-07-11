import { BACKEND_HTTP_URL } from "./backend";
import { encryptAuthPayload } from "./authCrypto";
import { updateProfile, type PlayerProfile } from "./profileStore";

export type AuthUser = {
    id: string;
    username: string;
    nickname: string;
    avatar: string | null;
    color: string | null;
    roleId: string | null;
    characterKey: string | null;
    currentScore: number;
    isAdmin: boolean;
};

export type AuthState = {
    token: string;
    user: AuthUser;
};

export type RemoteStats = {
    matches: number;
    wins: number;
    losses: number;
    draws: number;
    score: number;
    rating: number;
    rank: number;
    tier: string;
    winRate: number;
};

export type LeaderboardEntry = {
    rank: number;
    user: AuthUser;
    stats: RemoteStats;
};

const STORAGE_KEY = "yokonex:bomberman:auth";

export function loadAuthState(): AuthState | null {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) as AuthState : null;
    } catch {
        return null;
    }
}

export function isLoggedIn() {
    return Boolean(loadAuthState()?.token);
}

export function saveAuthState(state: AuthState) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    syncUserToLocalProfile(state.user);
}

export function clearAuthState() {
    window.localStorage.removeItem(STORAGE_KEY);
}

export async function registerAccount(username: string, password: string, nickname: string) {
    return authRequest("/auth/register", { username, password, nickname });
}

export async function loginAccount(username: string, password: string) {
    return authRequest("/auth/login", { username, password });
}

export async function fetchMyStats() {
    const response = await authFetch("/me/stats");
    return await response.json() as { stats: RemoteStats; history: unknown[] };
}

export async function fetchLeaderboard(limit = 50) {
    const response = await fetch(`${BACKEND_HTTP_URL}/leaderboard?limit=${limit}`);
    if (!response.ok) {
        throw new Error(await errorMessage(response));
    }

    return await response.json() as { entries: LeaderboardEntry[] };
}

export async function saveRemoteProfile(profile: Pick<PlayerProfile, "nickname" | "color" | "roleId" | "avatar" | "skinId">) {
    const response = await authFetch("/me/profile", {
        method: "PUT",
        body: JSON.stringify({
            nickname: profile.nickname,
            color: profile.color,
            avatar: profile.avatar,
            roleId: profile.roleId,
            characterKey: profile.skinId,
        }),
    });
    const data = await response.json() as { user: AuthUser };
    const state = loadAuthState();
    if (state) {
        saveAuthState({ ...state, user: data.user });
    }
    return data.user;
}

export function authHeaders() {
    const token = loadAuthState()?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authRequest(path: string, body: Record<string, string>) {
    const response = await fetch(`${BACKEND_HTTP_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encryptAuthPayload(body)),
    });

    if (!response.ok) {
        throw new Error(await errorMessage(response));
    }

    const state = await response.json() as AuthState;
    saveAuthState(state);
    return state;
}

async function authFetch(path: string, options: RequestInit = {}) {
    const response = await fetch(`${BACKEND_HTTP_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
            ...(options.headers ?? {}),
        },
    });

    if (!response.ok) {
        throw new Error(await errorMessage(response));
    }

    return response;
}

async function errorMessage(response: Response) {
    try {
        const data = await response.json() as { message?: string };
        return data.message || "请求失败";
    } catch {
        return "请求失败";
    }
}

function syncUserToLocalProfile(user: AuthUser) {
    // 登录后把账号资料同步到现有本地资料，复用当前房间和角色展示逻辑。
    updateProfile({
        nickname: user.nickname,
        color: user.color || undefined,
        roleId: user.roleId || undefined,
    });
}
