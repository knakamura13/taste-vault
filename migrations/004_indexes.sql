CREATE INDEX IF NOT EXISTS screenshots_ref_id_idx ON screenshots(ref_id);
CREATE INDEX IF NOT EXISTS ref_projects_project_id_idx ON ref_projects(project_id, ref_id);
CREATE INDEX IF NOT EXISTS ref_categories_category_id_idx ON ref_categories(category_id, ref_id);
CREATE INDEX IF NOT EXISTS refs_active_id_idx ON refs(id DESC) WHERE trashed_at IS NULL;
