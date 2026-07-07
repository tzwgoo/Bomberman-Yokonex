export type PlayerProfile = {
    nickname: string;
    color: string;
    title: string;
    roleId: string;
    avatar: string;
    skinId: string;
};

export type PlayerStats = {
    matches: number;
    wins: number;
    losses: number;
    draws: number;
};

export type ProfileState = {
    profile: PlayerProfile;
    stats: PlayerStats;
};

const STORAGE_KEY = "yokonex:bomberman:profile";

export const PROFILE_COLORS = ["#f6c453", "#63d2ff", "#ff7a7a", "#78d66b", "#d38cff", "#ff9f43"];

export type PlayerRole = {
    id: string;
    name: string;
    title: string;
    avatar: string;
    skinId: string;
    description: string;
};

export const PLAYER_ROLES: PlayerRole[] = [
    { id: "rookie", name: "爆破新星", title: "新晋爆破手", avatar: "🙂", skinId: "rookie", description: "稳定均衡，适合熟悉地图。" },
    { id: "blazer", name: "火花队长", title: "火花队长", avatar: "🔥", skinId: "blazer", description: "醒目的进攻风格。" },
    { id: "bolt", name: "闪电游侠", title: "闪电游侠", avatar: "⚡", skinId: "bolt", description: "轻快灵活，容易辨认。" },
    { id: "guard", name: "护盾卫士", title: "护盾卫士", avatar: "🛡️", skinId: "guard", description: "厚重防守感。" },
];

export const DEFAULT_ROLE = PLAYER_ROLES[0];

const DEFAULT_STATE: ProfileState = {
    profile: {
        nickname: "玩家",
        color: PROFILE_COLORS[0],
        title: DEFAULT_ROLE.title,
        roleId: DEFAULT_ROLE.id,
        avatar: DEFAULT_ROLE.avatar,
        skinId: DEFAULT_ROLE.skinId,
    },
    stats: {
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
    },
};

export function loadProfileState(): ProfileState {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return cloneDefaultState();
        }

        const parsed = JSON.parse(raw) as Partial<ProfileState>;
        const profile = normalizeProfile({ ...DEFAULT_STATE.profile, ...parsed.profile });
        return {
            profile,
            stats: { ...DEFAULT_STATE.stats, ...parsed.stats },
        };
    } catch {
        return cloneDefaultState();
    }
}

export function saveProfileState(state: ProfileState) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function updateProfile(profile: Partial<PlayerProfile>) {
    const state = loadProfileState();
    state.profile = normalizeProfile({
        ...state.profile,
        ...profile,
        nickname: normalizeNickname(profile.nickname ?? state.profile.nickname),
    });
    saveProfileState(state);
    return state;
}

export function recordMatchResult(result: "win" | "loss" | "draw") {
    const state = loadProfileState();
    state.stats.matches++;

    if (result === "win") {
        state.stats.wins++;
    } else if (result === "loss") {
        state.stats.losses++;
    } else {
        state.stats.draws++;
    }

    saveProfileState(state);
    return state;
}

export function resetPlayerStats() {
    const state = loadProfileState();
    state.stats = { ...DEFAULT_STATE.stats };
    saveProfileState(state);
    return state;
}

export function normalizeNickname(nickname: string) {
    return String(nickname ?? "").trim().slice(0, 16) || DEFAULT_STATE.profile.nickname;
}

export function findPlayerRole(roleId?: string) {
    return PLAYER_ROLES.find((role) => role.id === roleId) ?? DEFAULT_ROLE;
}

function normalizeProfile(profile: PlayerProfile) {
    const role = findPlayerRole(profile.roleId);
    return {
        ...profile,
        nickname: normalizeNickname(profile.nickname),
        color: PROFILE_COLORS.includes(profile.color) ? profile.color : DEFAULT_STATE.profile.color,
        // 角色头像和皮肤由角色表统一派生，避免旧本地数据出现不一致。
        roleId: role.id,
        title: role.title,
        avatar: role.avatar,
        skinId: role.skinId,
    };
}

function cloneDefaultState() {
    return JSON.parse(JSON.stringify(DEFAULT_STATE)) as ProfileState;
}
