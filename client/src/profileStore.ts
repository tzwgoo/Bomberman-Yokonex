export type PlayerProfile = {
    nickname: string;
    color: string;
    title: string;
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

const DEFAULT_STATE: ProfileState = {
    profile: {
        nickname: "玩家",
        color: PROFILE_COLORS[0],
        title: "新晋爆破手",
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
        return {
            profile: { ...DEFAULT_STATE.profile, ...parsed.profile },
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
    state.profile = {
        ...state.profile,
        ...profile,
        nickname: normalizeNickname(profile.nickname ?? state.profile.nickname),
    };
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

function cloneDefaultState() {
    return JSON.parse(JSON.stringify(DEFAULT_STATE)) as ProfileState;
}
