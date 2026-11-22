-- Strengthen strict pose limb-proportion matching and multi-image leg-duplication guards
-- for GPT Image and Grok Imagine without altering custom prompt structures.

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.promptTemplate.poseClause',
      '严格按照{{姿势图}}的头部朝向、身体动作、头身与四肢长度比例（尤其双腿各自的伸直或屈膝角度及前后层次）、景别构图与镜头角度摆姿势。'
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.promptTemplate') = 'object';

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.promptTemplate.constraints',
      (
        SELECT json_group_array(
          CASE
            WHEN json_extract(j.value, '$.id') = 'c_anatomy' THEN
              json_set(
                j.value,
                '$.text',
                '人物有且仅有左、右两条手臂、双手与左、右两条腿（共两条腿，绝不额外生出第三条腿或多余手臂），保持正常成年人头身与上下肢长度比例、肤色均匀及自然透视（构图偏窄时允许肢体末梢自然出画而非压短双腿）。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_pose_ignore_others' THEN
              json_set(
                j.value,
                '$.text',
                '仅借鉴{{姿势图}}的动作骨架与四肢比例（不保留白模、线稿质感或边缘编号/残影），严格忽略{{非姿势图}}中的原有动作、站位、膝腿弯曲姿态或垂坠袜腿轮廓。'
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
