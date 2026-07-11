-- Bomberman-Yokonex MySQL 初始化 DDL
-- 用途：不用 Prisma 迁移时，直接初始化数据库和业务表结构。
-- 注意：如果使用本文件初始化同一个库，不要再重复执行 prisma migrate deploy。

CREATE DATABASE IF NOT EXISTS `bomberman_yokonex`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `bomberman_yokonex`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(191) NOT NULL,
  `username` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(191) NOT NULL,
  `avatar` VARCHAR(191) NULL,
  `color` VARCHAR(191) NULL,
  `role_id` VARCHAR(191) NULL,
  `character_key` VARCHAR(191) NULL,
  `current_score` INTEGER NOT NULL DEFAULT 1000,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_username_key` (`username`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `matches` (
  `id` VARCHAR(191) NOT NULL,
  `room_id` VARCHAR(191) NOT NULL,
  `map_key` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `started_at` DATETIME(3) NOT NULL,
  `ended_at` DATETIME(3) NOT NULL,
  `winner_user_id` VARCHAR(191) NULL,
  `raw_data` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `matches_room_id_idx` (`room_id`),
  KEY `matches_winner_user_id_idx` (`winner_user_id`),
  CONSTRAINT `matches_winner_user_id_fkey`
    FOREIGN KEY (`winner_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `match_players` (
  `id` VARCHAR(191) NOT NULL,
  `match_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(191) NOT NULL,
  `rank` INTEGER NOT NULL,
  `score` INTEGER NOT NULL,
  `kills` INTEGER NOT NULL DEFAULT 0,
  `deaths` INTEGER NOT NULL DEFAULT 0,
  `survived_seconds` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `match_players_match_id_user_id_key` (`match_id`, `user_id`),
  KEY `match_players_user_id_idx` (`user_id`),
  CONSTRAINT `match_players_match_id_fkey`
    FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `match_players_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rating_changes` (
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `rating_changes_match_id_user_id_key` (`match_id`, `user_id`),
  KEY `rating_changes_user_id_idx` (`user_id`),
  KEY `rating_changes_after_score_idx` (`after_score`),
  CONSTRAINT `rating_changes_match_id_fkey`
    FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rating_changes_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- EMS 在线设备连接、管理员命令和客户端执行结果日志。
CREATE TABLE IF NOT EXISTS `ems_device_logs` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `admin_user_id` VARCHAR(191) NULL,
  `room_id` VARCHAR(191) NULL,
  `category` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `transport` VARCHAR(191) NULL,
  `status` VARCHAR(191) NULL,
  `success` BOOLEAN NULL,
  `message` VARCHAR(191) NULL,
  `detail` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ems_device_logs_user_id_created_at_idx` (`user_id`, `created_at`),
  KEY `ems_device_logs_admin_user_id_created_at_idx` (`admin_user_id`, `created_at`),
  KEY `ems_device_logs_category_created_at_idx` (`category`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
