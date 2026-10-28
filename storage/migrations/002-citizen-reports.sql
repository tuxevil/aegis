CREATE TABLE citizen_reports (
  id TEXT PRIMARY KEY,
  receipt_hash TEXT NOT NULL UNIQUE CHECK(length(receipt_hash)=64),
  request_hash TEXT NOT NULL UNIQUE CHECK(length(request_hash)=64),
  create_hash TEXT NOT NULL CHECK(length(create_hash)=64),
  observation_id TEXT REFERENCES observations(id),
  current_revision INTEGER NOT NULL CHECK(current_revision>=1),
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','withdrawn')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1))
) STRICT;
CREATE INDEX reports_queue ON citizen_reports(status,updated_at,id);
CREATE INDEX reports_retention ON citizen_reports(synthetic,created_at);
CREATE TABLE citizen_report_revisions (
  report_id TEXT NOT NULL REFERENCES citizen_reports(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision>=1),
  area_id TEXT NOT NULL REFERENCES areas(id),
  declaration TEXT NOT NULL CHECK(declaration IN ('outage','restored')),
  reported_start_at TEXT,
  received_at TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create','correct','withdraw')),
  reason TEXT NOT NULL CHECK(reason IN ('initial','wrong_area','wrong_time','changed_state','other','withdrawal')),
  consent_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY(report_id,revision)
) STRICT;
CREATE INDEX reports_area ON citizen_report_revisions(area_id,received_at,report_id,revision);
CREATE TABLE citizen_report_reviews (
  report_id TEXT NOT NULL REFERENCES citizen_reports(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY(report_id,revision),
  FOREIGN KEY(report_id,revision) REFERENCES citizen_report_revisions(report_id,revision)
) STRICT;
