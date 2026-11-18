-- Configure adaptive pose & camera framing support:
-- 1) Mark camera/interaction-dependent photography styles as poseMode = "adaptive"
--    and clarify natural phone-holding action in selfie presets.
-- 2) Split factory strict pose constraints into *_strict and add *_adaptive counterparts.
-- 3) Backfill new adaptive pose prompt template clauses if absent.

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
                '$.poseMode', 'adaptive',
                '$.prompt', '真实手机前置摄像头自拍风格，近距离手持自拍视角，单手自然举起持握手机或伸向镜头进行自拍（可自然调整手臂动作以配合自拍机位），自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常手机自拍质感。'
              )
            WHEN json_extract(j.value, '$.id') = 'photo_mirror_selfie' THEN
              json_set(
                j.value,
                '$.poseMode', 'adaptive',
                '$.prompt', '真实手机原相机镜面自拍风格，通过镜子反射拍摄人物，人物单手或双手自然举起手机对准镜面（可自然调整持机手臂动作，手机自然出现在镜面画面中），真实还原人物与镜面空间关系，自然随意的生活化姿态，真实细腻的皮肤与环境细节，手机计算摄影的清晰度与HDR效果，自然室内光线，未经刻意修饰的日常手机摄影质感。'
              )
            WHEN json_extract(j.value, '$.id') IN ('photo_pov', 'photo_candid', 'photo_cctv') THEN
              json_set(j.value, '$.poseMode', 'adaptive')
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

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.promptTemplate.adaptivePoseClause',
      '以{{姿势图}}中人体模型的主体站/坐姿、躯干朝向与核心肢体动态为基准参考，但允许根据当前画风所需的拍摄视角、镜头角度、景别构图与交互需求（如手持手机自拍、对镜举机、高角度监控等）自然调整局部手臂动作、头部朝向与镜头机位。',
      '$.promptTemplate.adaptiveNoPoseRecompositionClause',
      '不沿用{{人像图}}原本的拍摄机位、景别与固定姿势，请根据当前画风所需的镜头视角与交互需求自然重新构图并调整动作。',
      '$.promptTemplate.adaptivePoseStyleSuffix',
      '为充分呈现当前拍摄/画面风格，请优先保证该风格特有的镜头机位、景别透视与人物自然交互动作（如手持手机或对镜举机）。'
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
            WHEN json_extract(j.value, '$.id') = 'c_subject_count_pose'
             AND json_extract(j.value, '$.condition') = 'has_pose'
              THEN json_set(j.value, '$.condition', 'has_pose_strict')
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_others'
             AND json_extract(j.value, '$.condition') = 'has_pose_and_others'
              THEN json_set(j.value, '$.condition', 'has_pose_and_others_strict')
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_only'
             AND json_extract(j.value, '$.condition') = 'pose_only'
              THEN json_set(j.value, '$.condition', 'pose_only_strict')
            ELSE json(j.value)
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
SET value_json = json_insert(
      value_json,
      '$.promptTemplate.constraints[#]',
      json_object(
        'id', 'c_subject_count_pose_adaptive',
        'condition', 'has_pose_adaptive',
        'text', '画面中的人物数量严格以{{姿势图}}为准（单人姿势图仅生成一位主体人物，除非额外要求另有说明），严禁擅自新增多余人物或分身；景别构图与镜头机位优先配合当前画风自然呈现。',
        'enabled', json('true')
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.promptTemplate.constraints') = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.promptTemplate.constraints')
    WHERE json_extract(value, '$.id') = 'c_subject_count_pose_adaptive'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.promptTemplate.constraints[#]',
      json_object(
        'id', 'c_pose_priority_others_adaptive',
        'condition', 'has_pose_and_others_adaptive',
        'text', '以{{姿势图}}中的主体姿势与朝向为结构基础（不保留其无五官白模质感），忽略{{非姿势图}}中的原有动作与站位；允许为满足当前画风所需的拍摄视角与手持/交互动作（如举手机自拍、俯拍监控等）自然调整局部手臂动作与镜头角度。',
        'enabled', json('true')
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.promptTemplate.constraints') = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.promptTemplate.constraints')
    WHERE json_extract(value, '$.id') = 'c_pose_priority_others_adaptive'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.promptTemplate.constraints[#]',
      json_object(
        'id', 'c_pose_priority_only_adaptive',
        'condition', 'pose_only_adaptive',
        'text', '以{{姿势图}}中的主体姿势与朝向为基础参考，允许为满足当前画风所需的拍摄视角、景别构图与手持/交互动作（如举手机自拍、俯拍监控等）自然调整局部手臂动作与镜头角度。',
        'enabled', json('true')
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.promptTemplate.constraints') = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.promptTemplate.constraints')
    WHERE json_extract(value, '$.id') = 'c_pose_priority_only_adaptive'
  );
