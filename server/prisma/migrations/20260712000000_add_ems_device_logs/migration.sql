CREATE TABLE `ems_device_logs` (
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

    INDEX `ems_device_logs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `ems_device_logs_admin_user_id_created_at_idx`(`admin_user_id`, `created_at`),
    INDEX `ems_device_logs_category_created_at_idx`(`category`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
