-- Fix body & lower-leg anatomical proportions under adaptive close-up / selfie camera perspectives:
-- 1) Explicitly enforce real 3D torso/thigh/shin/arm anatomical proportions in c_skin_proportion and adaptivePoseClause.
-- 2) Allow close-up selfie framing to naturally crop lower legs/feet instead of shrinking shins to fit head-to-toe in frame.

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.promptTemplate.adaptivePoseClause',
      '以{{姿势图}}中人体模型的主体站/坐姿、躯干朝向与核心肢体动态为基准参考，在新的机位下严格重构符合真实三维空间透视与正常成年人解剖长度的躯干及上下肢比例（严禁机械照搬原图二维轮廓而压短小腿或四肢），并允许根据当前画风所需的拍摄视角、镜头角度、景别构图与交互需求（如手持手机自拍、对镜举机、高角度监控等）自然调整局部手臂动作、头部朝向、自然裁切范围与镜头机位。'
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
            WHEN json_extract(j.value, '$.id') = 'c_skin_proportion' THEN
              json_set(
                j.value,
                '$.text',
                '确保人物各露出部位肤色均匀一致，头身比例、躯干与上下肢（大腿、小腿、手臂）保持真实自然的人体解剖比例与空间透视，服装及饰品随实际姿势自然穿戴贴合；若姿势参考为半身或局部景别，优先保留该景别构图。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_subject_count_pose_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '画面中的人物数量严格以{{姿势图}}为准（单人姿势图仅生成一位主体人物，除非额外要求另有说明），严禁擅自新增多余人物或分身；景别构图与镜头机位优先配合当前画风自然呈现——若画风为近距离手持自拍等较近景别，允许下半身、小腿或双脚顺着透视自然裁切出画，严禁为了强行把全身及双脚塞进近景画面而缩短腿部或四肢比例。'
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
                '真实手机前置摄像头自拍风格，近距离手持自拍视角，单手自然举起持握手机或伸向镜头进行自拍（可自然调整手臂动作以配合自拍机位，遵循真实手持臂长下的近景或中近景构图，下半身及四肢末梢可自然延伸出画而不要强行缩腿塞满全身），自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常手机自拍质感。'
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
