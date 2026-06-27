-- 0032_ai_actions_requested_by.sql
-- FAZ 10.4: full audit trail on ai_pending_actions — who asked the AI to do this (via chat),
-- not just who resolved it. Lets the original requester approve/reject their own proposal
-- directly via the same chat, without requiring a separate admin step every time.
-- Applied directly via psql (drizzle-kit migrate's journal is frozen at 0011).

ALTER TABLE ai_pending_actions ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
