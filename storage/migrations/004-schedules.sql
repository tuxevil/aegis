CREATE TABLE schedule_documents (
  artifact_id TEXT PRIMARY KEY REFERENCES artifacts(id),
  provider_id TEXT NOT NULL,
  body BLOB NOT NULL CHECK(length(body)>0 AND length(body)<=2097152),
  parser_version TEXT NOT NULL,
  acquisition TEXT NOT NULL CHECK(acquisition IN ('local_import','https')),
  parse_error TEXT,
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1))
) STRICT;
CREATE TABLE schedule_captures (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES schedule_documents(artifact_id),
  sequence INTEGER NOT NULL CHECK(sequence>0),
  captured_at TEXT NOT NULL,
  UNIQUE(provider_id,sequence)
) STRICT;
CREATE TABLE schedule_entries (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  natural_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1)),
  UNIQUE(provider_id,natural_key)
) STRICT;
CREATE TABLE schedule_revisions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES schedule_entries(id),
  revision_no INTEGER NOT NULL CHECK(revision_no>0),
  predecessor_id TEXT REFERENCES schedule_revisions(id),
  artifact_id TEXT NOT NULL REFERENCES schedule_documents(artifact_id),
  capture_id TEXT NOT NULL REFERENCES schedule_captures(id),
  sector_label TEXT NOT NULL,
  local_date TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL CHECK(end_at>start_at),
  original_time_string TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('residential','industrial','maintenance','unknown')),
  motive TEXT NOT NULL,
  parser_confidence REAL NOT NULL CHECK(parser_confidence BETWEEN 0 AND 1),
  row_present INTEGER NOT NULL CHECK(row_present IN (0,1)),
  change_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1)),
  UNIQUE(entry_id,revision_no),
  UNIQUE(entry_id,capture_id)
) STRICT;
CREATE INDEX schedule_revision_latest ON schedule_revisions(entry_id,revision_no DESC);
CREATE INDEX schedule_revision_time ON schedule_revisions(start_at,end_at,entry_id);
CREATE TABLE schedule_capture_rows (
  capture_id TEXT NOT NULL REFERENCES schedule_captures(id),
  entry_id TEXT NOT NULL REFERENCES schedule_entries(id),
  revision_id TEXT NOT NULL REFERENCES schedule_revisions(id),
  PRIMARY KEY(capture_id,entry_id)
) STRICT;
CREATE TABLE schedule_bindings (
  provider_id TEXT NOT NULL,
  label_key TEXT NOT NULL,
  binding_no INTEGER NOT NULL CHECK(binding_no>0),
  area_id TEXT NOT NULL REFERENCES areas(id),
  reference_url TEXT NOT NULL,
  reason TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1)),
  PRIMARY KEY(provider_id,label_key,binding_no)
) STRICT;
CREATE TABLE schedule_reviews (
  revision_id TEXT NOT NULL REFERENCES schedule_revisions(id),
  review_no INTEGER NOT NULL CHECK(review_no>0),
  decision TEXT NOT NULL CHECK(decision IN ('reviewed','rejected')),
  area_id TEXT REFERENCES areas(id),
  rights_reviewed INTEGER NOT NULL CHECK(rights_reviewed IN (0,1)),
  reason TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY(revision_id,review_no)
) STRICT;
CREATE TABLE schedule_fetch_state (
  provider_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  next_allowed_at TEXT NOT NULL,
  completed_at TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('running','ok','not_modified','failed')),
  artifact_id TEXT REFERENCES schedule_documents(artifact_id),
  etag TEXT,
  last_modified TEXT
) STRICT;
CREATE TABLE schedule_fetch_history (
  attempt_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('ok','not_modified','failed')),
  artifact_id TEXT REFERENCES schedule_documents(artifact_id),
  error_code TEXT
) STRICT;
CREATE TRIGGER schedule_revisions_no_update BEFORE UPDATE ON schedule_revisions BEGIN SELECT RAISE(ABORT,'immutable schedule revision'); END;
CREATE TRIGGER schedule_revisions_no_delete BEFORE DELETE ON schedule_revisions BEGIN SELECT RAISE(ABORT,'immutable schedule revision'); END;
CREATE TRIGGER schedule_reviews_no_update BEFORE UPDATE ON schedule_reviews BEGIN SELECT RAISE(ABORT,'immutable schedule review'); END;
CREATE TRIGGER schedule_reviews_no_delete BEFORE DELETE ON schedule_reviews BEGIN SELECT RAISE(ABORT,'immutable schedule review'); END;
CREATE TRIGGER schedule_documents_no_update BEFORE UPDATE ON schedule_documents BEGIN SELECT RAISE(ABORT,'immutable schedule document'); END;
CREATE TRIGGER schedule_documents_no_delete BEFORE DELETE ON schedule_documents BEGIN SELECT RAISE(ABORT,'immutable schedule document'); END;

CREATE TRIGGER schedule_bindings_no_update BEFORE UPDATE ON schedule_bindings BEGIN SELECT RAISE(ABORT,'immutable schedule binding'); END;
CREATE TRIGGER schedule_bindings_no_delete BEFORE DELETE ON schedule_bindings BEGIN SELECT RAISE(ABORT,'immutable schedule binding'); END;
