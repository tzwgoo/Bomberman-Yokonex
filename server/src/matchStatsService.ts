import { isDatabaseConfigured, prisma } from "./db";

export type PlayerStatsDto = {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  winRate: number;
};

export async function getUserStats(userId: string) {
  if (!isDatabaseConfigured()) {
    return { stats: emptyStats(), history: [] };
  }

  const rows = await prisma.matchPlayer.findMany({
    where: { userId },
    include: { match: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const allRows = await prisma.matchPlayer.findMany({
    where: { userId },
    include: { match: true },
  });

  return {
    stats: buildStats(userId, allRows),
    history: rows.map((row) => ({
      matchId: row.matchId,
      roomId: row.match.roomId,
      mapKey: row.match.mapKey,
      rank: row.rank,
      score: row.score,
      won: row.match.winnerUserId === userId,
      endedAt: row.match.endedAt,
    })),
  };
}

export async function getLeaderboard(limit = 20) {
  if (!isDatabaseConfigured()) {
    return [];
  }

  const users = await prisma.user.findMany({
    include: {
      matchPlayers: {
        include: { match: true },
      },
    },
  });

  // 排行榜直接从已落库比赛聚合，先满足当前规模，后续量大再做缓存表。
  return users
    .map((user) => ({
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color,
        roleId: user.roleId,
      },
      stats: buildStats(user.id, user.matchPlayers),
    }))
    .filter((entry) => entry.stats.matches > 0)
    .sort((a, b) => b.stats.score - a.stats.score || b.stats.wins - a.stats.wins || b.stats.winRate - a.stats.winRate)
    .slice(0, Math.max(1, Math.min(100, limit)));
}

function buildStats(userId: string, rows: { score: number; match: { winnerUserId: string | null } }[]): PlayerStatsDto {
  const matches = rows.length;
  const wins = rows.filter((row) => row.match.winnerUserId === userId).length;
  const draws = rows.filter((row) => !row.match.winnerUserId).length;
  const losses = Math.max(0, matches - wins - draws);
  const score = rows.reduce((sum, row) => sum + row.score, 0);

  return {
    matches,
    wins,
    losses,
    draws,
    score,
    winRate: matches ? Math.round((wins / matches) * 100) : 0,
  };
}

function emptyStats(): PlayerStatsDto {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    score: 0,
    winRate: 0,
  };
}

