CREATE TABLE `cinema_knowledge_sources` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(191) NOT NULL DEFAULT 'image',
  `sourceUrl` TEXT NULL,
  `sourceTitle` VARCHAR(191) NULL,
  `sourceImageMediaId` VARCHAR(191) NULL,
  `rawOcrText` TEXT NULL,
  `extractedJson` TEXT NULL,
  `licenseStatus` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `cinema_knowledge_sources_userId_idx` (`userId`),
  INDEX `cinema_knowledge_sources_sourceImageMediaId_idx` (`sourceImageMediaId`),
  INDEX `cinema_knowledge_sources_status_idx` (`status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cinema_knowledge_sources_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cinema_knowledge_sources_sourceImageMediaId_fkey` FOREIGN KEY (`sourceImageMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cinema_knowledge_items` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `definition` TEXT NOT NULL,
  `usageRule` TEXT NULL,
  `promptPhrase` TEXT NOT NULL,
  `negativePhrase` TEXT NULL,
  `sceneTags` TEXT NULL,
  `shotTags` TEXT NULL,
  `moodTags` TEXT NULL,
  `craftTags` TEXT NULL,
  `priority` INTEGER NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `cinema_knowledge_items_userId_enabled_reviewStatus_idx` (`userId`, `enabled`, `reviewStatus`),
  INDEX `cinema_knowledge_items_sourceId_idx` (`sourceId`),
  INDEX `cinema_knowledge_items_category_idx` (`category`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cinema_knowledge_items_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cinema_knowledge_items_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `cinema_knowledge_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cinema_knowledge_bindings` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `knowledgeItemId` VARCHAR(191) NOT NULL,
  `scopeType` VARCHAR(191) NOT NULL DEFAULT 'project',
  `scopeId` VARCHAR(191) NULL,
  `mode` VARCHAR(191) NOT NULL DEFAULT 'boost',
  `weight` INTEGER NOT NULL DEFAULT 0,
  `createdByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `cinema_knowledge_bindings_projectId_scopeType_scopeId_idx` (`projectId`, `scopeType`, `scopeId`),
  INDEX `cinema_knowledge_bindings_knowledgeItemId_idx` (`knowledgeItemId`),
  INDEX `cinema_knowledge_bindings_createdByUserId_idx` (`createdByUserId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cinema_knowledge_bindings_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cinema_knowledge_bindings_knowledgeItemId_fkey` FOREIGN KEY (`knowledgeItemId`) REFERENCES `cinema_knowledge_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cinema_knowledge_bindings_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `prompt_knowledge_traces` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `targetType` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `promptKind` VARCHAR(191) NOT NULL,
  `knowledgeItemIds` TEXT NOT NULL,
  `matchedTags` TEXT NULL,
  `finalInjectedText` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `prompt_knowledge_traces_projectId_targetType_targetId_idx` (`projectId`, `targetType`, `targetId`),
  INDEX `prompt_knowledge_traces_userId_idx` (`userId`),
  INDEX `prompt_knowledge_traces_promptKind_idx` (`promptKind`),
  INDEX `prompt_knowledge_traces_createdAt_idx` (`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `prompt_knowledge_traces_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prompt_knowledge_traces_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
