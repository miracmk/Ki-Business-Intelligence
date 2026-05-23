-- FAZ 1.1: Add entity_external to user_role enum
-- FAZ 1.2: Migrate superadmin → admin

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'entity_external';

-- Migrate any superadmin users to admin
UPDATE users SET role = 'admin' WHERE role = 'superadmin';
