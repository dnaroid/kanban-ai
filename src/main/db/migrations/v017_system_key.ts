export const v017SystemKeySql = `
ALTER TABLE board_columns ADD COLUMN system_key TEXT NOT NULL DEFAULT '';

UPDATE board_columns
SET system_key = 'in_progress'
WHERE system_key = ''
  AND (
    lower(replace(replace(name, '_', ' '), '-', ' ')) IN ('in progress', 'в работе', 'в процессе')
    OR lower(name) LIKE '%progress%'
    OR lower(name) LIKE '%работ%'
  );
`
