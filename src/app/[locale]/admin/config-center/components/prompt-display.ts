const PROMPT_DISPLAY_NAMES: Record<string, string> = {
  character_image_to_description: '角色图片转外貌描述',
  character_reference_to_sheet: '角色参考图转设定表',
  np_agent_acting_direction: '表演指导代理',
  np_agent_character_profile: '角色档案分析代理',
  np_agent_character_visual: '角色视觉设计代理',
  np_agent_cinematographer: '摄影指导代理',
  np_agent_clip: '分镜剪辑代理',
  np_agent_shot_variant_analysis: '镜头变体分析代理',
  np_agent_shot_variant_generate: '镜头变体生成代理',
  np_agent_storyboard_detail: '分镜细节代理',
  np_agent_storyboard_insert: '分镜插入代理',
  np_agent_storyboard_plan: '分镜规划代理',
  np_ai_story_expand: '故事扩写',
  np_character_create: '创建角色',
  np_character_description_update: '更新角色描述',
  np_character_modify: '修改角色设定',
  np_character_regenerate: '重新生成角色',
  np_character_voice_recommend: '推荐角色音色',
  np_character_voice_recommend_cosy: '推荐角色 Cosy 音色',
  np_director_snapshot_render: '导演快照渲染',
  np_episode_split: '剧集拆分',
  np_image_prompt_modify: '修改图片提示词',
  np_location_create: '创建场景',
  np_location_description_update: '更新场景描述',
  np_location_modify: '修改场景设定',
  np_location_regenerate: '重新生成场景',
  np_panel_grid_enhance: '宫格分镜增强',
  np_panel_grid_image: '宫格分镜生图',
  np_panel_grid_video: '宫格分镜生成视频',
  np_project_cover_generation: '生成项目封面',
  np_prop_description_update: '更新道具描述',
  np_screenplay_conversion: '剧本格式转换',
  np_select_location: '选择场景',
  np_select_prop: '选择道具',
  np_single_panel_image: '单格分镜生图',
  np_storyboard_edit: '编辑分镜',
  np_voice_analysis: '声音分析',
  skill_api_config_template_system: 'API 配置模板系统提示词',
  skill_tutorial_system: '技能教程系统提示词',
}

const PROMPT_DISPLAY_DESCRIPTIONS: Record<string, string> = {
  character_image_to_description: '根据上传图片反推角色外貌描述',
  character_reference_to_sheet: '把角色参考图整理为可复用角色设定表',
  np_agent_acting_direction: '为镜头生成表演、情绪和台词执行方向',
  np_agent_character_profile: '从故事中提取角色身份、性格和叙事定位',
  np_agent_character_visual: '生成适合视觉生产的角色外观方案',
  np_agent_cinematographer: '规划镜头语言、景别和画面调度',
  np_agent_clip: '把分镜内容组织为剪辑执行建议',
  np_agent_shot_variant_analysis: '分析镜头变体的差异和适用场景',
  np_agent_shot_variant_generate: '生成可替换的镜头变体方案',
  np_agent_storyboard_detail: '补充分镜画面细节和执行信息',
  np_agent_storyboard_insert: '在既有分镜中插入过渡或补充镜头',
  np_agent_storyboard_plan: '规划故事到分镜的整体拆解方案',
  np_ai_story_expand: '扩写原始故事并增强短剧叙事节奏',
  np_character_create: '根据故事创建角色设定',
  np_character_description_update: '根据新信息同步更新角色描述',
  np_character_modify: '按用户要求调整角色设定',
  np_character_regenerate: '重新生成角色设定候选',
  np_character_voice_recommend: '根据角色特征推荐旁白或配音音色',
  np_character_voice_recommend_cosy: '为 CosyVoice 体系推荐角色音色',
  np_director_snapshot_render: '生成导演视角的画面快照描述',
  np_episode_split: '把长故事拆分为短剧集结构',
  np_image_prompt_modify: '按反馈改写图片生成提示词',
  np_location_create: '根据故事创建场景设定',
  np_location_description_update: '根据新信息同步更新场景描述',
  np_location_modify: '按用户要求调整场景设定',
  np_location_regenerate: '重新生成场景设定候选',
  np_panel_grid_enhance: '增强宫格分镜的画面提示词',
  np_panel_grid_image: '为多格分镜生成图片提示词',
  np_panel_grid_video: '为多格分镜生成视频提示词',
  np_project_cover_generation: '生成项目封面图提示词',
  np_prop_description_update: '根据新信息同步更新道具描述',
  np_screenplay_conversion: '把故事内容转换为短剧剧本',
  np_select_location: '从场景库中为剧情选择合适场景',
  np_select_prop: '从道具库中为剧情选择合适道具',
  np_single_panel_image: '为单个分镜生成图片提示词',
  np_storyboard_edit: '按用户要求修改分镜内容',
  np_voice_analysis: '分析文本所需的声音风格和配音要求',
  skill_api_config_template_system: '生成技能 API 配置模板的系统提示词',
  skill_tutorial_system: '生成技能教程内容的系统提示词',
}

const PROMPT_CATEGORY_LABELS: Record<string, string> = {
  'character-reference': '角色参考',
  'novel-promotion': '小说推文',
  skills: '技能',
}

export function getPromptDisplayName(promptId: string, fallbackName?: string) {
  return PROMPT_DISPLAY_NAMES[promptId] ?? fallbackName ?? promptId
}

export function getPromptDisplayDescription(promptId: string, fallbackDescription?: string | null) {
  return fallbackDescription || PROMPT_DISPLAY_DESCRIPTIONS[promptId] || ''
}

export function getPromptCategoryLabel(category: string) {
  return PROMPT_CATEGORY_LABELS[category] ?? category
}
