-- Merge suppliers that share the same normalized base_url into a single supplier
-- with multiple keys in supplier_keys, and deduplicate redundant channels.

DROP TABLE IF EXISTS _tmp_supplier_merge_map;

CREATE TABLE _tmp_supplier_merge_map (
  old_id TEXT PRIMARY KEY,
  old_name TEXT NOT NULL,
  keep_id TEXT NOT NULL,
  keep_name TEXT NOT NULL
);

INSERT INTO _tmp_supplier_merge_map (old_id, old_name, keep_id, keep_name)
WITH ranked AS (
  SELECT
    id,
    name,
    LOWER(RTRIM(TRIM(base_url), '/')) AS norm_url,
    FIRST_VALUE(id) OVER (
      PARTITION BY LOWER(RTRIM(TRIM(base_url), '/'))
      ORDER BY enabled DESC, created_at ASC, id ASC
    ) AS keep_id,
    FIRST_VALUE(name) OVER (
      PARTITION BY LOWER(RTRIM(TRIM(base_url), '/'))
      ORDER BY enabled DESC, created_at ASC, id ASC
    ) AS keep_name,
    COUNT(*) OVER (
      PARTITION BY LOWER(RTRIM(TRIM(base_url), '/'))
    ) AS grp_cnt
  FROM suppliers
)
SELECT id, name, keep_id, keep_name
FROM ranked
WHERE grp_cnt > 1 AND id != keep_id;

-- Preserve each original supplier name as the key label when still using the generic default label
UPDATE supplier_keys
SET label = (
  SELECT s.name FROM suppliers s WHERE s.id = supplier_keys.supplier_id
)
WHERE (label = '' OR label = '默认密钥')
  AND (
    supplier_id IN (SELECT old_id FROM _tmp_supplier_merge_map)
    OR supplier_id IN (SELECT keep_id FROM _tmp_supplier_merge_map)
  );

-- Move keys from duplicate suppliers onto the canonical keeper supplier
UPDATE supplier_keys
SET supplier_id = (
  SELECT m.keep_id FROM _tmp_supplier_merge_map m WHERE m.old_id = supplier_keys.supplier_id
)
WHERE supplier_id IN (SELECT old_id FROM _tmp_supplier_merge_map);

-- Re-point channels from duplicate suppliers onto the canonical keeper supplier
UPDATE provider_channels
SET supplier_id = (
  SELECT m.keep_id FROM _tmp_supplier_merge_map m WHERE m.old_id = provider_channels.supplier_id
)
WHERE supplier_id IN (SELECT old_id FROM _tmp_supplier_merge_map);

-- Deduplicate channels that now point to the same keeper supplier with identical profile, effective model, and params
DELETE FROM provider_channels
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          provider_id,
          COALESCE(profile_id, ''),
          supplier_id,
          model,
          CASE WHEN model = 'custom' THEN custom_model ELSE '' END,
          params_json,
          key_ids_json
        ORDER BY enabled DESC, priority DESC, created_at ASC, id ASC
      ) AS rn
    FROM provider_channels
    WHERE supplier_id IN (SELECT DISTINCT keep_id FROM _tmp_supplier_merge_map)
  )
  WHERE rn > 1
);

-- Update visionFallback.supplierId in platform_config if it referenced a merged duplicate supplier
UPDATE system_settings
SET value_json = json_set(
  value_json,
  '$.visionFallback.supplierId',
  (
    SELECT m.keep_id
    FROM _tmp_supplier_merge_map m
    WHERE m.old_id = json_extract(system_settings.value_json, '$.visionFallback.supplierId')
  )
)
WHERE key = 'platform_config'
  AND json_extract(value_json, '$.visionFallback.supplierId') IN (
    SELECT old_id FROM _tmp_supplier_merge_map
  );

-- Clean up trailing A/B suffix on keeper supplier names & refresh key hint summary
UPDATE suppliers
SET
  name = TRIM(
    CASE
      WHEN name LIKE '% A' OR name LIKE '% B' THEN SUBSTR(name, 1, LENGTH(name) - 2)
      WHEN name LIKE '%官方A' OR name LIKE '%官方B' THEN SUBSTR(name, 1, LENGTH(name) - 1)
      ELSE name
    END
  ),
  api_key_hint = (
    SELECT
      CASE
        WHEN COUNT(*) <= 1 THEN COALESCE(MAX(sk.api_key_hint), '')
        ELSE SUM(CASE WHEN sk.enabled = 1 THEN 1 ELSE 0 END) || '/' || COUNT(*) || ' 个密钥'
      END
    FROM supplier_keys sk
    WHERE sk.supplier_id = suppliers.id
  ),
  updated_at = CAST(unixepoch() AS INTEGER) * 1000
WHERE id IN (SELECT DISTINCT keep_id FROM _tmp_supplier_merge_map);

-- Also refresh channel names that inherited the old A/B keeper name
UPDATE provider_channels
SET name = (
  SELECT s.name FROM suppliers s WHERE s.id = provider_channels.supplier_id
)
WHERE supplier_id IN (SELECT DISTINCT keep_id FROM _tmp_supplier_merge_map)
  AND (
    name IN (SELECT DISTINCT keep_name FROM _tmp_supplier_merge_map)
    OR name IN (SELECT old_name FROM _tmp_supplier_merge_map)
  );

-- Delete merged duplicate supplier rows
DELETE FROM suppliers
WHERE id IN (SELECT old_id FROM _tmp_supplier_merge_map);

DROP TABLE IF EXISTS _tmp_supplier_merge_map;
