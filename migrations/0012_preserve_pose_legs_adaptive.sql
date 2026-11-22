-- Preserve lower-body / lifted-leg pose fidelity in adaptive pose mode
-- while maintaining natural adult limb proportions and wide-angle selfie framing.

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.promptTemplate.adaptivePoseClause',
      '以{{姿势图}}中人体模型的身体姿态、躯干倾角、双腿与下肢动作（如悬空抬腿、屈膝、坐卧、交叉等关键下肢动态必须严格保留，绝不擅自将抬起或悬空的双腿放平落地）以及非持机侧手臂支撑动作为动作依据；仅允许为满足当前画风所需的拍摄视角与互动需求，调整镜头机位、广角取景范围与持机侧手臂动作，并在新机位下保持正常成年人真实的躯干与大腿/小腿骨骼比例（严禁缩腿变形）。'
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
            WHEN json_extract(j.value, '$.id') = 'c_subject_count_pose_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '画面中的人物数量严格以{{姿势图}}为准（单人姿势图仅生成一位主体人物，除非额外要求另有说明），严禁擅自新增多余人物或分身；景别与镜头机位配合当前画风自然取景——若需同时展现{{姿势图}}的腿部动态，可通过伸展手臂拉远广角自拍机位以完整容纳真实比例的长腿，或保持双腿原有姿态方向并让肢体末梢自然延伸出画，严禁为了缩进画框而压短小腿，也严禁擅自改变双腿原本的抬起/悬空方向。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_others_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '严格保留{{姿势图}}中的躯干倾角、双腿动作（如悬空抬腿、屈膝、交叉等下肢姿态不得擅自改成放平落地）与非持机肢体动态（仅借鉴结构，不保留白模质感），忽略{{非姿势图}}中的原有动作与站位；允许为满足当前画风所需的拍摄视角与手持/交互动作（如举手机自拍、俯拍监控等）调整镜头机位、取景范围与持机侧手臂动作。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_only_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '严格保留{{姿势图}}中的躯干倾角、双腿动作（如悬空抬腿、屈膝、交叉等下肢姿态不得擅自改成放平落地）与非持机肢体动态；允许为满足当前画风所需的拍摄视角、景别构图与手持/交互动作（如举手机自拍、俯拍监控等）调整镜头机位与持机侧手臂动作。'
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
                '真实手机前置摄像头自拍风格，单手举起持握手机对准自己拍摄的手持广角自拍视角（可自然调整持机侧手臂动作与手机俯仰视角以配合自拍机位；当姿势包含全身或双腿动态时，取伸直手臂的广角中远自拍景别或允许肢体末梢按真实长腿比例自然延伸出画，不要强行缩腿塞满画面，也不要改变双腿原本的抬起/伸展方向），自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常手机自拍质感。'
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
