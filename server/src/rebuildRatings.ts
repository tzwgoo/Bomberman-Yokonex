import "dotenv/config";

import { prisma } from "./db";
import { ratingDelta } from "./matchPersistence";

const INITIAL_SCORE = 1000;

async function rebuildRatings() {
  const matches = await prisma.match.findMany({
    include: { players: true },
    orderBy: { endedAt: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    await tx.ratingChange.deleteMany({});
    await tx.user.updateMany({ data: { currentScore: INITIAL_SCORE } });

    const scoreByUser = new Map<string, number>();

    for (const match of matches) {
      const players = [...match.players].sort((a, b) => a.rank - b.rank);

      for (const player of players) {
        const beforeScore = scoreByUser.get(player.userId) ?? INITIAL_SCORE;
        const delta = ratingDelta({
          playerCount: players.length,
          rank: player.rank,
          isWinner: player.userId === match.winnerUserId,
          isDraw: !match.winnerUserId,
        });
        const afterScore = Math.max(0, beforeScore + delta);

        // 历史重算只基于已落库比赛，保证积分流水可追溯。
        await tx.ratingChange.create({
          data: {
            matchId: match.id,
            userId: player.userId,
            beforeScore,
            delta,
            afterScore,
            reason: match.winnerUserId ? "rebuild_match_settled" : "rebuild_match_draw",
            rank: player.rank,
            season: "default",
          },
        });
        await tx.user.update({
          where: { id: player.userId },
          data: { currentScore: afterScore },
        });
        scoreByUser.set(player.userId, afterScore);
      }
    }
  }, { timeout: 60000 });

  console.log(`Rebuilt ratings from ${matches.length} matches.`);
}

rebuildRatings()
  .catch((error) => {
    console.error("Failed to rebuild ratings", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
