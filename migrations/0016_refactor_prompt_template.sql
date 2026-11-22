-- Refactor platform prompt template into orthogonal reusable clauses without overlapping branches,
-- and restore explicit arm-budget conflict resolution + default negative anatomy exclusions.

UPDATE system_settings
SET value_json = json_set(
      value_json,
      '$.defaultNegativePrompt',
      '分屏，拼图，多宫格，多视图，对比图，重复人物，双胞胎，多余手臂，多余肢体',
      '$.promptTemplate',
      json('{
        "intro": "请根据提供的 {{总数}} 张参考图（{{参考图序}}），生成单幅连续场景的人物{{媒介}}：",
        "poseClause": "严格按照{{姿势图}}的头部朝向、身体动作、景别构图与镜头角度摆姿势。",
        "costumeClause": "穿上{{服装图}}中的整套服装与配饰，配色、款式与面料细节以{{服装图}}为准。",
        "portraitClause": "外貌、脸型五官、神态、发型发色与肤色严格以{{人像图}}为准。",
        "portraitOwnOutfitClause": "沿用{{人像图}}中的原有服装穿搭。",
        "facelessClause": "生成无五官展示人物，全身肤色自然统一。",
        "defaultPersonClause": "生成五官清晰、肤色自然的单一人物。",
        "extraClause": "{{附图列表}}，按标注或合理画面关系自然融入图像。",
        "adaptiveCostumeClause": "参考{{服装图}}的配色与主要款式，细节可随当前风格自然调整。",
        "adaptivePortraitClause": "参考{{人像图}}的发型发色与整体神韵，五官特征与肤色随当前风格自然适配调整。",
        "adaptiveStyleSuffix": "尽量让人物的外貌与服饰适配当前整体风格。",
        "adaptivePoseClause": "以{{姿势图}}的躯干、下肢姿态与重心为动作骨架，顺应画风调整机位与取景；若画风交互需占用一侧手臂且与参考姿势双手冲突，必须舍弃其中一侧手势改作画风动作、至多保留另一侧原手势，严禁额外长出多余手臂。",
        "adaptiveNoPoseRecompositionClause": "不沿用{{人像图}}原本的机位、景别与站姿，按当前画风自然重新构图与动作。",
        "adaptivePoseStyleSuffix": "优先满足该画风特有的镜头机位、景别透视与自然交互（交互动作必须直接占用人物已有双臂之一）。",
        "constraints": [
          {
            "id": "c_no_text",
            "condition": "always",
            "text": "画面中没有任何文字、标志或水印。",
            "enabled": true
          },
          {
            "id": "c_single_canvas",
            "condition": "always",
            "text": "整张图仅为一个单一连续完整画面，严禁分屏、拼贴或同人重复出现。",
            "enabled": true
          },
          {
            "id": "c_anatomy",
            "condition": "always",
            "text": "人物严格仅有左右两条手臂、双手与双腿，保持正常人体解剖比例、肤色均匀及自然透视（必要时允许肢体末梢自然出画而非压缩变形）。",
            "enabled": true
          },
          {
            "id": "c_pose_count",
            "condition": "has_pose",
            "text": "人物数量严格以{{姿势图}}为准，严禁擅自增减人物。",
            "enabled": true
          },
          {
            "id": "c_pose_ignore_others",
            "condition": "has_pose_and_others",
            "text": "仅借鉴{{姿势图}}的动作骨架（不保留白模或线稿质感），忽略{{非姿势图}}中的原有动作与站位。",
            "enabled": true
          }
        ]
      }')
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json);
