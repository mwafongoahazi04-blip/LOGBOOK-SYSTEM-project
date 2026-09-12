-- IPTMS database schema. Runs automatically on server startup (idempotent).

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('student','industrial','university','faculty','superadmin')),
  signature       TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  active_session_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logbooks (
  id                  SERIAL PRIMARY KEY,
  student_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_name        TEXT NOT NULL,
  entry_date          DATE NOT NULL,
  activity            TEXT NOT NULL,
  observations        TEXT NOT NULL DEFAULT '',
  remarks             TEXT NOT NULL DEFAULT '',
  student_sig         TEXT,
  student_signed_at   TIMESTAMPTZ,
  industrial_id       INTEGER REFERENCES users(id),
  industrial_sig      TEXT,
  industrial_signed_at TIMESTAMPTZ,
  university_id       INTEGER REFERENCES users(id),
  university_notes    TEXT NOT NULL DEFAULT '',
  university_sig      TEXT,
  university_signed_at TIMESTAMPTZ,
  faculty_id          INTEGER REFERENCES users(id),
  faculty_remarks     TEXT NOT NULL DEFAULT '',
  faculty_sig         TEXT,
  faculty_signed_at   TIMESTAMPTZ,
  print_enabled       BOOLEAN NOT NULL DEFAULT false,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id                   SERIAL PRIMARY KEY,
  student_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_name         TEXT NOT NULL,
  perm_date            DATE NOT NULL,
  reason               TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  industrial_id        INTEGER REFERENCES users(id),
  industrial_sig       TEXT,
  industrial_signed_at TIMESTAMPTZ,
  requested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  actor_id   INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL,
  role       TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logbooks_student    ON logbooks(student_id);
CREATE INDEX IF NOT EXISTS idx_logbooks_industrial  ON logbooks(industrial_id);
CREATE INDEX IF NOT EXISTS idx_logbooks_university  ON logbooks(university_id);
CREATE INDEX IF NOT EXISTS idx_permissions_student  ON permissions(student_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON audit_log(created_at DESC);
