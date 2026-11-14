CREATE TABLE intake_receipts (
 id uuid PRIMARY KEY,
 first_ref_id bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
