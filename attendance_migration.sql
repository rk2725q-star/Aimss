-- ═══════════════════════════════════════════════════════════════
--  Dr.AIMSS — Attendance System Migration
--  Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Table 1: attendance_students — roster of students
CREATE TABLE IF NOT EXISTS attendance_students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  initial       TEXT,          -- Roll number / initial
  class_id      TEXT NOT NULL, -- '6','7',...,'12','neet','jee', etc.
  board         TEXT NOT NULL DEFAULT 'stateboard',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 2: attendance_records — daily attendance entries
CREATE TABLE IF NOT EXISTS attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL,
  student_id    UUID NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
  date          DATE NOT NULL,           -- e.g. 2026-06-14
  status        TEXT NOT NULL CHECK (status IN ('present','absent')),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, date)              -- one record per student per day
);

-- Indexes for fast class-wise / date-wise queries
CREATE INDEX IF NOT EXISTS idx_att_students_inst   ON attendance_students(institution_id);
CREATE INDEX IF NOT EXISTS idx_att_students_class  ON attendance_students(institution_id, class_id);
CREATE INDEX IF NOT EXISTS idx_att_records_student ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_att_records_date    ON attendance_records(institution_id, date);

-- ── Row Level Security ──────────────────────────────────────────
ALTER TABLE attendance_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;

-- Teachers can read/write their institution's data
CREATE POLICY "teacher_full_students" ON attendance_students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher','admin')
        AND profiles.institution_id = attendance_students.institution_id
    )
  );

CREATE POLICY "teacher_full_records" ON attendance_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher','admin')
        AND profiles.institution_id = attendance_records.institution_id
    )
  );

-- Students can read their OWN records only
CREATE POLICY "student_read_own" ON attendance_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM attendance_students s
      JOIN profiles p ON p.institution_id = s.institution_id
      WHERE s.id = attendance_records.student_id
        AND p.id = auth.uid()
        AND p.role = 'student'
    )
  );
