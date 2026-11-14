CREATE TABLE IF NOT EXISTS projects (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, archived_at timestamptz);
CREATE TABLE IF NOT EXISTS categories (id uuid PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE SEQUENCE IF NOT EXISTS reference_number;
CREATE TABLE IF NOT EXISTS refs (id bigint PRIMARY KEY DEFAULT nextval('reference_number'), title text NOT NULL, source_url text, notes text NOT NULL DEFAULT '', tags text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), trashed_at timestamptz);
CREATE TABLE IF NOT EXISTS ref_projects (ref_id bigint NOT NULL REFERENCES refs ON DELETE CASCADE, project_id uuid NOT NULL REFERENCES projects ON DELETE CASCADE, PRIMARY KEY(ref_id, project_id));
CREATE TABLE IF NOT EXISTS ref_categories (ref_id bigint NOT NULL REFERENCES refs ON DELETE CASCADE, category_id uuid NOT NULL REFERENCES categories ON DELETE CASCADE, PRIMARY KEY(ref_id, category_id));
CREATE TABLE IF NOT EXISTS screenshots (id uuid PRIMARY KEY, ref_id bigint NOT NULL REFERENCES refs ON DELETE CASCADE, storage_key text NOT NULL UNIQUE, content_hash text NOT NULL, media_type text NOT NULL, filename text NOT NULL, description text, description_approved_at timestamptz);
CREATE INDEX IF NOT EXISTS screenshots_hash_idx ON screenshots(content_hash);
