ALTER TABLE refs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS capture_jobs (
 id uuid PRIMARY KEY, ref_id bigint NOT NULL REFERENCES refs ON DELETE CASCADE,
 source_url text NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
 error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 screenshot_id uuid REFERENCES screenshots ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS capture_jobs_status_idx ON capture_jobs(status, created_at);
