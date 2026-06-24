/**
 * 宫格图重新生成时，清空旧的宫格视频提示词重写标记，使下次生成视频自动重写。
 * 非宫格布局返回空 patch。
 */
export function buildGridInvalidationPatch(imageLayout: 'grid' | 'single'): { gridVideoPromptAt?: null } {
  return imageLayout === 'grid' ? { gridVideoPromptAt: null } : {}
}
