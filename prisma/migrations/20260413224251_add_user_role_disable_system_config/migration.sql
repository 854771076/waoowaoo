-- AlterTable for User model - add role and isDisabled
ALTER TABLE `user`
ADD COLUMN `role` VARCHAR(191) NOT NULL DEFAULT 'user',
ADD COLUMN `isDisabled` TINYINT(1) NOT NULL DEFAULT 0;

-- CreateTable for SystemConfig
CREATE TABLE `system_config` (
    `id` VARCHAR(191) NOT NULL,
    `llmBaseUrl` VARCHAR(191) DEFAULT 'https://openrouter.ai/api/v1',
    `llmApiKey` TEXT,
    `falApiKey` TEXT,
    `googleAiKey` TEXT,
    `arkApiKey` TEXT,
    `qwenApiKey` TEXT,
    `newapiApiKey` TEXT,
    `newapiBaseUrl` VARCHAR(191),
    `customModels` TEXT,
    `customProviders` TEXT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
