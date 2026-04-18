-- ══════════════════════════════════════════════════
--  PyBank — Neon PostgreSQL Setup
--  Run this once in your Neon SQL Editor at:
--  https://console.neon.tech → SQL Editor
-- ══════════════════════════════════════════════════

-- 1. Create visitor counter table
CREATE TABLE IF NOT EXISTS visitor_counter (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  count        BIGINT  NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- 2. Insert initial row
INSERT INTO visitor_counter (id, count) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- ── Verify questions_clean table has the right columns ──
-- Your existing table should have:
--   sr_no, unit_number, question_text, answer, marks,
--   previous_year, option_a, option_b, option_c, option_d

-- 3. Quick check
SELECT COUNT(*) AS total_questions FROM questions_clean;
SELECT COUNT(*) AS total_units FROM (SELECT DISTINCT unit_number FROM questions_clean) u;
SELECT * FROM visitor_counter;
