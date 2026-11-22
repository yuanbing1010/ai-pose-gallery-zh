-- Streamline adaptive prompt clauses, constraints, negative prompt, and selfie presets
-- into concise, universal rules without scenario-specific patchwork.

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.promptTemplate.adaptivePoseClause',
      '以{{姿势图}}的主体姿态与下肢动作为基础，在符合所选画风的机位视角与构图下，允许顺应视角微调局部肢体动作与取景范围（仅对已有双臂做动作替换，不增生肢体），并保持真实的三维透视与人体比例。',
      '$.promptTemplate.adaptiveNoPoseRecompositionClause',
      '不沿用{{人像图}}原本的机位、景别与站姿，按当前画风自然重新构图并调整动作。',
      '$.promptTemplate.adaptivePoseStyleSuffix',
      '优先满足该画风特有的镜头机位、景别透视与自然交互动作。'
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.promptTemplate') = 'object';

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.defaultNegativePrompt',
      CASE
        WHEN coalesce(json_extract(value_json, '$.defaultNegativePrompt'), '') = ''
          THEN '多余肢体'
        WHEN instr(json_extract(value_json, '$.defaultNegativePrompt'), '多余手臂，第三只手') > 0
          THEN replace(json_extract(value_json, '$.defaultNegativePrompt'), '多余手臂，第三只手', '多余肢体')
        WHEN instr(json_extract(value_json, '$.defaultNegativePrompt'), '多余肢体') > 0
          THEN json_extract(value_json, '$.defaultNegativePrompt')
        ELSE json_extract(value_json, '$.defaultNegativePrompt') || '，多余肢体'
      END
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json);

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.promptTemplate.constraints',
      (
        SELECT json_group_array(
          CASE
            WHEN json_extract(j.value, '$.id') = 'c_skin_proportion' THEN
              json_set(
                j.value,
                '$.text',
                '严格保持正常人体结构与比例（仅双臂双腿，无多余肢体）、肤色均匀及服装自然贴合；半身或局部参考优先沿用其景别。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_subject_count_pose_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '人物数量严格以{{姿势图}}为准，严禁新增多余人物；景别与机位顺应画风自然取景，保持真实人体比例，必要时允许肢体末梢自然出画而非压缩变形。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_others_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '保留{{姿势图}}的主体动态与下肢姿态（仅借鉴结构，不保留白模质感），忽略{{非姿势图}}中的原有动作与站位；允许为适配画风视角与互动需求微调机位与局部手臂动作（仅替换已有手臂动作，不增生肢体）。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_only_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '保留{{姿势图}}的主体动态与下肢姿态，允许为适配画风视角与互动需求微调机位、景别与局部手臂动作（仅替换已有手臂动作，不增生肢体）。'
              )
            ELSE
              json(j.value)
          END
        )
        FROM json_each(value_json, '$.promptTemplate.constraints') j
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.promptTemplate.constraints') = 'array';

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.stylePresets',
      (
        SELECT json_group_array(
          CASE
            WHEN json_extract(j.value, '$.id') = 'photo_selfie' THEN
              json_set(
                j.value,
                '$.prompt',
                '真实手机前置摄像头自拍风格，单手持机自拍视角，自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常手机自拍质感。'
              )
            WHEN json_extract(j.value, '$.id') = 'photo_mirror_selfie' THEN
              json_set(
                j.value,
                '$.prompt',
                '真实手机原相机镜面自拍风格，通过镜子反射拍摄人物，手持手机对镜自拍（手机自然出现在镜面画面中），真实还原人物与镜面空间关系，自然随意的生活化姿态，真实细腻的皮肤与环境细节，手机计算摄影的清晰度与HDR效果，自然室内光线，未经刻意修饰的日常手机摄影质感。'
              )
            ELSE
              json(j.value)
          END
        )
        FROM json_each(value_json, '$.stylePresets') j
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array';
