-- Import the "摄影" (photography) style category, subcategories, and 10 presets
-- into existing D1 system_settings.platform_config rows idempotently.
-- Fresh databases automatically receive the same definitions via DEFAULT_PLATFORM_CONFIG.

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.styleCategories[#]',
      json_object('id', 'photography', 'label', '摄影')
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.styleCategories') = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleCategories')
    WHERE json_extract(value, '$.id') = 'photography'
       OR json_extract(value, '$.label') = '摄影'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.styleSubcategories[#]',
      json_object('id', 'photo_phone', 'categoryId', 'photography', 'label', '真实手机')
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.styleSubcategories') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleCategories')
    WHERE json_extract(value, '$.id') = 'photography'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_phone'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.styleSubcategories[#]',
      json_object('id', 'photo_pro', 'categoryId', 'photography', 'label', '专业设备')
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.styleSubcategories') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleCategories')
    WHERE json_extract(value, '$.id') = 'photography'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_pro'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_selfie',
        'categoryId', 'photography',
        'subcategoryId', 'photo_phone',
        'label', '自拍',
        'prompt', '真实手机前置摄像头自拍风格，近距离手持自拍视角，自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常手机自拍质感。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_phone'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_selfie'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_mirror_selfie',
        'categoryId', 'photography',
        'subcategoryId', 'photo_phone',
        'label', '对镜自拍',
        'prompt', '真实手机原相机镜面自拍风格，通过镜子反射拍摄人物，手机自然出现在镜面画面中，真实还原人物与镜面空间关系，自然随意的生活化姿态，真实细腻的皮肤与环境细节，手机计算摄影的清晰度与HDR效果，自然室内光线，未经刻意修饰的日常手机摄影质感。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_phone'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_mirror_selfie'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_pov',
        'categoryId', 'photography',
        'subcategoryId', 'photo_phone',
        'label', '第一人称POV',
        'prompt', '真实手机第一人称POV拍摄风格，以拍摄者的主观视角呈现人物，镜头模拟拍摄者本人视线高度与观察距离，人物仿佛正在与镜头前的拍摄者互动，自然的眼神交流与生活化动作，真实环境光，细腻自然的皮肤纹理，轻微广角透视，手机原相机的真实成像与HDR质感。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_phone'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_pov'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_candid',
        'categoryId', 'photography',
        'subcategoryId', 'photo_phone',
        'label', '第三人称抓拍',
        'prompt', '真实手机第三人称随手抓拍风格，以旁观者视角拍摄人物，人物自然处于生活环境中，不刻意摆拍，不要求直视镜头，捕捉真实随意的动作与瞬间表情，非专业摄影构图，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，轻微广角透视，未经刻意修饰的日常手机摄影质感。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_phone'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_candid'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_commercial',
        'categoryId', 'photography',
        'subcategoryId', 'photo_pro',
        'label', '商业写真',
        'prompt', '高品质专业模特写真摄影风格，成熟商业写真机构级拍摄水准，精致自然的人物面部与身体比例，细腻真实的皮肤质感，精致专业的妆容与人物造型，优雅自然且富有表现力的姿态，专业摄影布光与精准曝光，细腻真实的色彩与材质表现，清晰锐利的主体细节，构图精致协调，呈现高品质网红模特、职业Coser及商业写真集的专业摄影质感。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_pro'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_commercial'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_magazine',
        'categoryId', 'photography',
        'subcategoryId', 'photo_pro',
        'label', '时尚杂志',
        'prompt', '高级时尚杂志摄影风格，精致高级的人物造型与时尚表现力，优雅而富有张力的人物姿态，专业戏剧化布光，鲜明而高级的色彩搭配，清晰细腻的皮肤与服装材质，具有视觉冲击力的时尚构图，强烈的画面设计感与艺术表现力，奢华精致的商业时尚大片质感。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_pro'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_magazine'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_polaroid',
        'categoryId', 'photography',
        'subcategoryId', 'photo_pro',
        'label', '拍立得',
        'prompt', '经典拍立得即时成像摄影风格，真实即时显影照片质感，柔和自然的色彩表现，低饱和复古色调，细腻的模拟成像颗粒，柔和的高光过渡与适度曝光偏差，轻微色彩褪变，独特的即时相纸成像质感，自然随意的生活摄影氛围，经典宝丽来与Instax拍立得摄影美学。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_pro'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_polaroid'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_dv',
        'categoryId', 'photography',
        'subcategoryId', 'photo_pro',
        'label', 'DV录像',
        'prompt', '90年代至2000年代复古家用DV录像成像风格，真实低分辨率数字视频画面，明显的早期数码摄像机成像特征，柔和模糊的细节，轻微色彩溢出与视频压缩痕迹，交错扫描纹理，动态画面残影，有限的动态范围与不均匀曝光，怀旧的家庭录像质感，原汁原味的MiniDV与早期Handycam影像美学。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_pro'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_dv'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_cctv',
        'categoryId', 'photography',
        'subcategoryId', 'photo_pro',
        'label', '监控摄像头',
        'prompt', '真实监控摄像头录像画面风格，固定机位的高位俯拍或广角监控视角，明显的桶形畸变与空间透视，低分辨率数字成像，有限的动态范围，轻微数字噪点与视频压缩痕迹，偏冷或偏灰的监控色彩，较深的景深与大范围环境记录，缺乏专业摄影布光的真实监控影像质感。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_pro'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_cctv'
  );

UPDATE system_settings
SET value_json = json_insert(
      value_json,
      '$.stylePresets[#]',
      json_object(
        'id', 'photo_vintage_film',
        'categoryId', 'photography',
        'subcategoryId', 'photo_pro',
        'label', '复古胶片',
        'prompt', '经典复古彩色胶片摄影风格，真实自然的模拟胶片成像质感，有机细腻的胶片颗粒，柔和自然的高光过渡，丰富细腻的中间调，温暖通透的胶片色彩，自然真实的肤色表现，柔和适度的明暗反差，轻微色彩偏移与细腻的胶片光晕，保留真实的光学成像质感，呈现原汁原味的经典35mm彩色胶片摄影美学。'
      )
    ),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE key = 'platform_config'
  AND json_valid(value_json)
  AND json_type(value_json, '$.stylePresets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.styleSubcategories')
    WHERE json_extract(value, '$.id') = 'photo_pro'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(value_json, '$.stylePresets')
    WHERE json_extract(value, '$.id') = 'photo_vintage_film'
  );
