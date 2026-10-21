CREATE TABLE correlation_cases (
  event_id TEXT PRIMARY KEY REFERENCES events(id),
  anchor_at TEXT,
  kind TEXT NOT NULL,
  review_hold INTEGER NOT NULL DEFAULT 0 CHECK(review_hold IN (0,1)),
  rule_version TEXT NOT NULL
) STRICT;
CREATE INDEX correlation_anchor ON correlation_cases(anchor_at,event_id);
CREATE TABLE correlation_claims (
  observation_id TEXT PRIMARY KEY REFERENCES observations(id),
  event_id TEXT NOT NULL REFERENCES correlation_cases(event_id),
  signal TEXT NOT NULL CHECK(signal IN ('outage','restored','refute','retraction')),
  origin_key TEXT,
  origin_reviewed INTEGER NOT NULL CHECK(origin_reviewed IN (0,1)),
  canonical_url TEXT,
  replaces TEXT REFERENCES correlation_claims(observation_id),
  competence_area TEXT REFERENCES areas(id),
  competence_from TEXT,
  competence_to TEXT,
  review_reason TEXT NOT NULL,
  input_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT;
CREATE INDEX correlation_claim_event ON correlation_claims(event_id,recorded_at,observation_id);
CREATE TABLE correlation_revisions (
  event_id TEXT NOT NULL REFERENCES correlation_cases(event_id),
  revision INTEGER NOT NULL CHECK(revision>0),
  rule_version TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  PRIMARY KEY(event_id,revision)
) STRICT;
CREATE TRIGGER correlation_claims_no_update BEFORE UPDATE ON correlation_claims BEGIN SELECT RAISE(ABORT,'immutable correlation claim'); END;
CREATE TRIGGER correlation_claims_no_delete BEFORE DELETE ON correlation_claims BEGIN SELECT RAISE(ABORT,'immutable correlation claim'); END;
CREATE TRIGGER correlation_revisions_no_update BEFORE UPDATE ON correlation_revisions BEGIN SELECT RAISE(ABORT,'immutable correlation revision'); END;
CREATE TRIGGER correlation_revisions_no_delete BEFORE DELETE ON correlation_revisions BEGIN SELECT RAISE(ABORT,'immutable correlation revision'); END;
