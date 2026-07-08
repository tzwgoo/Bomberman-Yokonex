-- AlterTable
ALTER TABLE `users` ADD COLUMN `current_score` INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE `rating_changes` (
    `id` VARCHAR(191) NOT NULL,
    `match_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `before_score` INTEGER NOT NULL,
    `delta` INTEGER NOT NULL,
    `after_score` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `rank` INTEGER NOT NULL,
    `season` VARCHAR(191) NOT NULL DEFAULT 'default',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rating_changes_user_id_idx`(`user_id`),
    INDEX `rating_changes_after_score_idx`(`after_score`),
    UNIQUE INDEX `rating_changes_match_id_user_id_key`(`match_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `rating_changes` ADD CONSTRAINT `rating_changes_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rating_changes` ADD CONSTRAINT `rating_changes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
