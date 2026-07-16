-- CreateTable
CREATE TABLE `production_canvases` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `version` INTEGER NOT NULL DEFAULT 0,
    `viewport` JSON NULL,
    `settings` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `production_canvases_projectId_updatedAt_idx`(`projectId`, `updatedAt`),
    INDEX `production_canvases_userId_updatedAt_idx`(`userId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_canvas_nodes` (
    `id` VARCHAR(191) NOT NULL,
    `canvasId` VARCHAR(191) NOT NULL,
    `nodeKey` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `templateKey` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `width` DOUBLE NULL,
    `height` DOUBLE NULL,
    `zIndex` INTEGER NOT NULL DEFAULT 0,
    `refType` VARCHAR(191) NULL,
    `refId` VARCHAR(191) NULL,
    `data` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'idle',
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `locked` BOOLEAN NOT NULL DEFAULT false,
    `collapsed` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `production_canvas_nodes_canvasId_nodeKey_key`(`canvasId`, `nodeKey`),
    INDEX `production_canvas_nodes_canvasId_kind_idx`(`canvasId`, `kind`),
    INDEX `production_canvas_nodes_refType_refId_idx`(`refType`, `refId`),
    INDEX `production_canvas_nodes_canvasId_status_idx`(`canvasId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_canvas_edges` (
    `id` VARCHAR(191) NOT NULL,
    `canvasId` VARCHAR(191) NOT NULL,
    `edgeKey` VARCHAR(191) NOT NULL,
    `sourceNodeId` VARCHAR(191) NOT NULL,
    `targetNodeId` VARCHAR(191) NOT NULL,
    `sourceHandle` VARCHAR(191) NULL,
    `targetHandle` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'dependency',
    `label` VARCHAR(191) NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `production_canvas_edges_canvasId_edgeKey_key`(`canvasId`, `edgeKey`),
    INDEX `production_canvas_edges_canvasId_sourceNodeId_idx`(`canvasId`, `sourceNodeId`),
    INDEX `production_canvas_edges_canvasId_targetNodeId_idx`(`canvasId`, `targetNodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_canvas_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `canvasId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `reason` VARCHAR(191) NULL,
    `snapshot` JSON NOT NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `production_canvas_snapshots_canvasId_version_key`(`canvasId`, `version`),
    INDEX `production_canvas_snapshots_canvasId_createdAt_idx`(`canvasId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_node_templates` (
    `id` VARCHAR(191) NOT NULL,
    `templateKey` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `inputSchema` JSON NULL,
    `outputSchema` JSON NULL,
    `configSchema` JSON NULL,
    `defaultData` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `production_node_templates_templateKey_key`(`templateKey`),
    INDEX `production_node_templates_kind_idx`(`kind`),
    INDEX `production_node_templates_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_workflow_templates` (
    `id` VARCHAR(191) NOT NULL,
    `templateKey` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(191) NOT NULL,
    `definition` JSON NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `production_workflow_templates_templateKey_key`(`templateKey`),
    INDEX `production_workflow_templates_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `production_canvases` ADD CONSTRAINT `production_canvases_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_canvases` ADD CONSTRAINT `production_canvases_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_canvas_nodes` ADD CONSTRAINT `production_canvas_nodes_canvasId_fkey` FOREIGN KEY (`canvasId`) REFERENCES `production_canvases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_canvas_edges` ADD CONSTRAINT `production_canvas_edges_canvasId_fkey` FOREIGN KEY (`canvasId`) REFERENCES `production_canvases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_canvas_snapshots` ADD CONSTRAINT `production_canvas_snapshots_canvasId_fkey` FOREIGN KEY (`canvasId`) REFERENCES `production_canvases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
