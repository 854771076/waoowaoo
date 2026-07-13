-- 新增 parentId 自引用外键 + sceneType 字段
ALTER TABLE `novel_promotion_locations`
  ADD COLUMN `sceneType` VARCHAR(16) NOT NULL DEFAULT 'macro',
  ADD COLUMN `parentId` VARCHAR(191) NULL,
  ADD CONSTRAINT `novel_promotion_locations_parentId_fkey`
    FOREIGN KEY (`parentId`) REFERENCES `novel_promotion_locations`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 回填：已有数据全部升为大场景（包括 assetKind='prop'，但 prop 不会走分层逻辑）
UPDATE `novel_promotion_locations` SET `sceneType` = 'macro' WHERE `sceneType` IS NULL OR `sceneType` = '';

-- 索引
CREATE INDEX `novel_promotion_locations_parentId_idx` ON `novel_promotion_locations`(`parentId`);
