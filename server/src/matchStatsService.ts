import { isDatabaseConfigured, prisma } from "./db";

export type PlayerStatsDto = {
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

export async function getUserStats(userId: string) {
  if (!isDatabaseConfigured()) {
    return { stats: emptyStats(), history: [], ratingChanges: [] };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { stats: emptyStats(), history: [], ratingChanges: [] };
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
  const ratingChanges = await prisma.ratingChange.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const rank = await getUserRank(user.currentScore);

  return {
    stats: buildStats(userId, allRows, user.currentScore, rank),
    history: rows.map((row) => ({
      matchId: row.matchId,
      roomId: row.match.roomId,
      mapKey: row.match.mapKey,
      rank: row.rank,
      score: row.score,
      won: row.match.winnerUserId === userId,
      endedAt: row.match.endedAt,
    })),
    ratingChanges,
  };
}

export async function getLeaderboard(limit = 20) {
  if (!isDatabaseConfigured()) {
    return [];
  }

  const users = await prisma.user.findMany({
    orderBy: [
      { currentScore: "desc" },
      { updatedAt: "asc" },
    ],
    take: Math.max(1, Math.min(100, limit)),
    include: {
      matchPlayers: {
        include: { match: true },
      },
    },
  });

  // 排行榜以当前积分为主，胜场和胜率只是辅助展示。
  return users
    .map((user, index) => ({
      rank: index + 1,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color,
        roleId: user.roleId,
      },
      stats: buildStats(user.id, user.matchPlayers, user.currentScore, index + 1),
    }))
    .filter((entry) => entry.stats.matches > 0 || entry.stats.rating !== 1000);
}

export function tierForScore(score: number) {
  if (score >= 1800) {
    return "钻石";
  }

  if (score >= 1500) {
    return "铂金";
  }

  if (score >= 1200) {
    return "黄金";
  }

  if (score >= 1000) {
    return "白银";
  }

  return "青铜";
}

async function getUserRank(currentScore: number) {
  return (await prisma.user.count({ where: { currentScore: { gt: currentScore } } })) + 1;
}

function buildStats(
  userId: string,
  rows: { score: number; match: { winnerUserId: string | null } }[],
  rating: number,
  rank: number,
): PlayerStatsDto {
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
    rating,
    rank,
    tier: tierForScore(rating),
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
    rating: 1000,
    rank: 0,
    tier: tierForScore(1000),
    winRate: 0,
  };
}
