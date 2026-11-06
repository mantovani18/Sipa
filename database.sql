-- Crie o banco "sipa" pelo pgAdmin, se ele ainda não existir.
-- Depois selecione o banco "sipa" e execute este script.
CREATE TABLE IF NOT EXISTS participants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  department VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE participants DROP COLUMN IF EXISTS registration;

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  event_day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_id, event_day)
);

CREATE INDEX IF NOT EXISTS attendance_day_idx ON attendance(event_day);
