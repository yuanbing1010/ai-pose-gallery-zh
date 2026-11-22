-- Prevent front-camera selfie style ("photo_selfie") from triggering a phone/hand prop at the bottom edge of the frame.
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
                '前置广角镜头近景自拍风格，由人物自身一侧手臂向镜头方向自然前伸出画（拍摄设备位于取景框之外，画面中只呈现人物肩臂自然延展至画面边缘）、另一侧手臂自然放松或做单侧姿态，自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，清晰的高动态范围计算摄影效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常前置自拍质感。',
                '$.negativePrompt',
                '手机，智能手机，手持手机，握着手机，底部伸出的手，第三只手'
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
