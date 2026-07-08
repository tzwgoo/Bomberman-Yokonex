import type { Prisma } from "@prisma/client";

import { isDatabaseConfigured, prisma } from "./db";

export type MatchResultPlayer = {
  sessionId: string;
  userId: string;
  nickname: string;
  score: number;
  alive: boolean;
};

export type MatchResultInput = {
  roomId: string;
  mapKey: string;
  startedAt: Date;
  endedAt: Date;
  winnerUserId?: string;
  players: MatchResultPlayer[];
  rawData: Record<string, unknown>;
};

export async function saveMatchResult(input: MatchResultInput) {
  if (!isDatabaseConfigured()) {
    return { skipped: true, reason: "database_not_configured" };
  }

  const players = input.players.filter((player) => player.userId);
  if (!players.length) {
    return { skipped: true, reason: "no_registered_players" };
  }

  const rankedPlayers = [...players].sort((a, b) => b.score - a.score);

  // 比赛只在最终结算后落库一次，避免对局中频繁写库影响实时同步。
  const match = await prisma.match.create({
    data: {
      roomId: input.roomId,
      mapKey: input.mapKey,
      status: "settled",
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      winnerUserId: input.winnerUserId || null,
      rawData: input.rawData as Prisma.InputJsonValue,
      players: {
        create: rankedPlayers.map((player, index) => ({
          userId: player.userId,
          nickname: player.nickname,
          rank: index + 1,
          score: player.score,
          deaths: player.alive ? 0 : 1,
          survivedSeconds: Math.max(0, Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 1000)),
        })),
      },
    },
  });

  return { skipped: false, matchId: match.id };
}
