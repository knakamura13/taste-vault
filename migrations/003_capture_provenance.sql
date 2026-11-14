ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'upload';
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS page_url text;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS captured_at timestamptz;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS archive_timestamp text;
ALTER TABLE capture_jobs ADD COLUMN IF NOT EXISTS lease uuid;
