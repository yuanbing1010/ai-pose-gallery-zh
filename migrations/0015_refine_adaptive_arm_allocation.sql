-- Refine adaptive arm-allocation rules concisely and universally without scenario-specific phrasing.

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.promptTemplate.adaptivePoseClause',
      '以{{姿势图}}的躯干、下肢姿态与重心为动作骨架，并严格保持人物仅有一左一右两条手臂；当当前画风需要手臂配合拍摄视角或互动时，必须直接改用这双臂中的一侧来执行（若{{姿势图}}原为双手动作，须舍弃一侧原手势仅保留单侧，严禁保留双手原动作后再多出一条手臂），同时顺应画风调整机位、取景范围与真实三维比例。',
      '$.promptTemplate.adaptivePoseStyleSuffix',
      '优先满足该画风特有的镜头机位、景别透视与自然交互（交互动作直接复用人物原有双臂之一完成）。'
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
          THEN '多余手臂，多余肢体'
        WHEN instr(json_extract(value_json, '$.defaultNegativePrompt'), '多余手臂') > 0
          THEN json_extract(value_json, '$.defaultNegativePrompt')
        WHEN instr(json_extract(value_json, '$.defaultNegativePrompt'), '多余肢体') > 0
          THEN replace(json_extract(value_json, '$.defaultNegativePrompt'), '多余肢体', '多余手臂，多余肢体')
        ELSE json_extract(value_json, '$.defaultNegativePrompt') || '，多余手臂，多余肢体'
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
                '人物严格仅有左右两条手臂、双手与双腿，保持正常人体解剖比例、肤色均匀及服装自然贴合；半身或局部参考优先沿用其景别。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_others_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '保留{{姿势图}}的躯干与下肢姿态（仅借鉴结构，不保留白模质感），忽略{{非姿势图}}中的原有动作与站位；若画风动作与{{姿势图}}手臂姿势冲突，必须优先让出一侧手臂改作画风动作、只保留另一侧原手势，严禁在双手原动作外另增手臂。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_only_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '保留{{姿势图}}的躯干与下肢姿态，顺应画风调整机位与景别；若画风动作与{{姿势图}}手臂姿势冲突，必须优先让出一侧手臂改作画风动作、只保留另一侧原手势，严禁在双手原动作外另增手臂。'
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
