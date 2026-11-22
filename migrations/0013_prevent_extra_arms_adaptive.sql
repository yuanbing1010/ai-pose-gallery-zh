-- Prevent third-arm / extra-hand artifacts when two-handed poses combine with handheld selfie styles.

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.promptTemplate.adaptivePoseClause',
      '以{{姿势图}}中人体模型的身体姿态、躯干倾角、双腿与下肢动作（如悬空抬腿、屈膝、坐卧、交叉等关键下肢动态必须严格保留，绝不擅自将抬起或悬空的双腿放平落地）为动作依据；人物严格只有左右两条手臂，仅允许改用其中一只手去完成当前画风所需的持机或自拍互动（若{{姿势图}}原本双手都在做动作，必须舍弃并改用其中一侧手来持机，仅保留另一侧手的原动作，严禁保留双手原动作后又多长出第三只手），同时在新机位下调整镜头角度与广角取景范围，并保持正常成年人真实的躯干与大腿/小腿骨骼比例。'
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
          THEN '多余手臂，第三只手'
        WHEN instr(json_extract(value_json, '$.defaultNegativePrompt'), '第三只手') > 0
          THEN json_extract(value_json, '$.defaultNegativePrompt')
        ELSE json_extract(value_json, '$.defaultNegativePrompt') || '，多余手臂，第三只手'
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
                '确保人物严格仅有左右两条手臂与两只手（严禁多手、多臂或多余肢体），各露出部位肤色均匀一致，头身比例、躯干与上下肢（大腿、小腿、手臂）保持真实自然的人体解剖比例与空间透视，服装及饰品随实际姿势自然穿戴贴合；若姿势参考为半身或局部景别，优先保留该景别构图。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_others_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '严格保留{{姿势图}}中的躯干倾角与双腿动作（如悬空抬腿、屈膝、交叉等下肢姿态不得擅自改成放平落地，仅借鉴结构，不保留其无五官白模质感），忽略{{非姿势图}}中的原有动作与站位；人物严格只有左右两只手臂——允许为满足当前画风的拍摄视角与手持动作调整镜头机位、取景范围并改用其中一只手来持机（若原姿势为双手动作，必须改由单手做原动作、另一只手改作持机，严禁出现第三只手）。'
              )
            WHEN json_extract(j.value, '$.id') = 'c_pose_priority_only_adaptive' THEN
              json_set(
                j.value,
                '$.text',
                '严格保留{{姿势图}}中的躯干倾角与双腿动作（如悬空抬腿、屈膝、交叉等下肢姿态不得擅自改成放平落地）；人物严格只有左右两只手臂——允许为满足当前画风的拍摄视角与手持动作调整镜头机位、景别构图并改用其中一只手来持机（若原姿势为双手动作，必须改由单手做原动作、另一只手改作持机，严禁出现第三只手）。'
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
                '真实手机前置摄像头自拍风格，由左右两臂中的单侧手臂自然伸向镜头举机拍摄的手持广角自拍视角（另一侧手臂保持自然姿势或仅保留单侧原动作，严禁出现多余手臂或第三只手；当姿势包含全身或双腿动态时，取伸直手臂的广角中远自拍景别或允许肢体末梢按真实长腿比例自然延伸出画，不要强行缩腿塞满画面，也不要改变双腿原本的抬起/伸展方向），自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常手机自拍质感。'
              )
            WHEN json_extract(j.value, '$.id') = 'photo_mirror_selfie' THEN
              json_set(
                j.value,
                '$.prompt',
                '真实手机原相机镜面自拍风格，通过镜子反射拍摄人物，人物使用左右两臂中的单手或双手自然举起手机对准镜面（若原参考姿势占用双手，需改用其中一只手举手机对镜，严禁出现多余手臂或第三只手，手机自然出现在镜面画面中），真实还原人物与镜面空间关系，自然随意的生活化姿态，真实细腻的皮肤与环境细节，手机计算摄影的清晰度与HDR效果，自然室内光线，未经刻意修饰的日常手机摄影质感。'
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
