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

CREATE TABLE IF NOT EXISTS raffles (
  id SERIAL PRIMARY KEY,
  event_day DATE NOT NULL,
  winner_id INTEGER NOT NULL REFERENCES participants(id),
  winner_name VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_name VARCHAR(120);
UPDATE raffles r SET winner_name = p.name
FROM participants p
WHERE r.winner_id = p.id AND r.winner_name IS NULL;
ALTER TABLE raffles ALTER COLUMN winner_name SET NOT NULL;
ALTER TABLE raffles DROP CONSTRAINT IF EXISTS raffles_event_day_key;
CREATE INDEX IF NOT EXISTS raffles_event_day_idx ON raffles(event_day);
