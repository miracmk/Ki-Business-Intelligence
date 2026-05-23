DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'member';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint

UPDATE users SET role = 'superadmin' WHERE email = 'mirac@kibusiness.co';
