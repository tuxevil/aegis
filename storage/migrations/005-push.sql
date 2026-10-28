CREATE TABLE watch_subscriptions (
  id TEXT PRIMARY KEY,
  management_hash TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL UNIQUE,
  create_hash TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  preferences TEXT,
  push_consent INTEGER NOT NULL CHECK(push_consent IN (0,1)),
  endpoint_hash TEXT UNIQUE,
  endpoint_sealed TEXT,
  endpoint_state TEXT NOT NULL CHECK(endpoint_state IN ('none','active','invalid')),
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_test_at TEXT,
  last_accepted_at TEXT,
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1))
) STRICT;
CREATE TABLE watch_areas (
  subscription_id TEXT NOT NULL REFERENCES watch_subscriptions(id) ON DELETE CASCADE,
  area_id TEXT NOT NULL REFERENCES areas(id),
  alias_sealed TEXT NOT NULL,
  PRIMARY KEY(subscription_id,area_id)
) STRICT;
CREATE TABLE schedule_cancellations (
  revision_id TEXT PRIMARY KEY REFERENCES schedule_revisions(id),
  evidence_quote TEXT NOT NULL,
  review_reason TEXT NOT NULL,
  confirmed_at TEXT NOT NULL
) STRICT;
CREATE TABLE push_dedup (
  subscription_id TEXT NOT NULL REFERENCES watch_subscriptions(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(subscription_id,event_key)
) STRICT;
CREATE TABLE push_outbox (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES watch_subscriptions(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('scheduled','change','cancellation','test')),
  revision_id TEXT REFERENCES schedule_revisions(id),
  area_id TEXT REFERENCES areas(id),
  review_no INTEGER,
  subscription_revision INTEGER NOT NULL,
  payload_sealed TEXT,
  due_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','inflight','accepted','suppressed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT,
  lease_until TEXT,
  result_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subscription_id,event_key)
) STRICT;
CREATE INDEX push_outbox_due ON push_outbox(state,due_at,subscription_id);
CREATE INDEX watch_expiry ON watch_subscriptions(status,expires_at,id);
CREATE TRIGGER schedule_cancellations_no_update BEFORE UPDATE ON schedule_cancellations BEGIN SELECT RAISE(ABORT,'immutable cancellation'); END;
CREATE TRIGGER schedule_cancellations_no_delete BEFORE DELETE ON schedule_cancellations BEGIN SELECT RAISE(ABORT,'immutable cancellation'); END;
