-- Upgrade untouched factory-default model_profiles from English/version jargon
-- to plain, understandable Chinese brush names and short capability traits.

UPDATE model_profiles
SET display_name = '精绘稳笔',
    badge = CASE WHEN badge = '' THEN '画得稳' ELSE badge END,
    tagline = CASE WHEN tagline = '' THEN '人体结构与光影还原稳定，适合精细成图' ELSE tagline END
WHERE id = 'prof_gpt_default'
  AND display_name = 'GPT Image';

UPDATE model_profiles
SET display_name = '灵绘主笔',
    badge = CASE WHEN badge = '' THEN '理解准' ELSE badge END,
    tagline = CASE WHEN tagline = '' THEN '中文语义与画风迁移细腻自然' ELSE tagline END
WHERE id = 'prof_gemini_default'
  AND display_name = 'Nano Banana';

UPDATE model_profiles
SET display_name = '星舰主笔',
    badge = CASE WHEN badge = '' THEN '张力强' ELSE badge END,
    tagline = CASE WHEN tagline = '' THEN '画面张力与光影质感突出' ELSE tagline END
WHERE id = 'prof_grok_default'
  AND display_name = 'Grok 2.0';
