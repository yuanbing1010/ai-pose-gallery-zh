-- Prioritize style-driven arm allocation over symmetrical two-hand pose copying,
-- and describe explicit two-arm composition inside selfie/mirror-selfie styles cleanly.

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.promptTemplate.adaptivePoseClause',
      '参考{{姿势图}}的躯干朝向、重心与整体姿态，但必须优先按当前画风调整机位与手臂动作：人物有且仅有左右两条手臂，当画风需要单臂配合拍摄或互动时，必须直接改用其中一条手臂执行（不得完整照搬参考图的双手对称姿势，仅可保留另一条空余手臂做单侧动作）。',
      '$.promptTemplate.adaptivePoseStyleSuffix',
      '优先满足该画风特有的镜头机位、景别透视与自然交互（交互动作直接占用人物原有双臂之一）。'
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.promptTemplate') = 'object';

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
                '真实手机前置摄像头自拍风格，单臂前伸向镜头持机自拍、另一侧手臂自然放松或做单手姿态的广角近景视角，自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常手机自拍质感。'
              )
            WHEN json_extract(j.value, '$.id') = 'photo_mirror_selfie' THEN
              json_set(
                j.value,
                '$.prompt',
                '真实手机原相机镜面自拍风格，通过镜子反射拍摄人物，单手持机对准镜面、另一侧自然配合姿态（手机自然出现在镜面画面中），真实还原人物与镜面空间关系，自然随意的生活化姿态，真实细腻的皮肤与环境细节，手机计算摄影的清晰度与HDR效果，自然室内光线，未经刻意修饰的日常手机摄影质感。'
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
