CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
CREATE TABLE areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES areas(id),
  type TEXT NOT NULL CHECK(type IN ('province','canton','parish','sector')),
  location_precision TEXT NOT NULL CHECK(location_precision IN ('administrative_area','generalized_sector')),
  code TEXT,
  polygon_ref TEXT,
  polygon_version TEXT,
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1))
) STRICT;
CREATE INDEX areas_parent ON areas(parent_id);
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('authority','news','social','citizen','sensor')),
  name TEXT NOT NULL,
  official INTEGER NOT NULL CHECK(official IN (0,1) AND (official=0 OR kind='authority')),
  source_url TEXT,
  access_policy TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1))
) STRICT;
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_url TEXT NOT NULL,
  source_published_at TEXT,
  fetched_at TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  media_type TEXT NOT NULL,
  stored_ref TEXT,
  parse_version TEXT NOT NULL,
  extraction_status TEXT NOT NULL CHECK(extraction_status IN ('pending','parsed','failed','review')),
  provenance TEXT NOT NULL,
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1)),
  UNIQUE(source_id, sha256),
  UNIQUE(id, source_id)
) STRICT;
CREATE INDEX artifacts_time ON artifacts(fetched_at, id);
CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  artifact_id TEXT REFERENCES artifacts(id),
  area_id TEXT NOT NULL REFERENCES areas(id),
  dedupe_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  occurred_at TEXT,
  observed_at TEXT,
  reported_start_at TEXT,
  source_published_at TEXT,
  ingested_at TEXT NOT NULL,
  temporal_confidence TEXT NOT NULL CHECK(temporal_confidence IN ('exact','approximate','unknown')),
  location_precision TEXT NOT NULL CHECK(location_precision IN ('administrative_area','generalized_sector')),
  moderation_state TEXT NOT NULL CHECK(moderation_state IN ('pending','approved','rejected','withdrawn')),
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1)),
  UNIQUE(source_id, dedupe_key),
  FOREIGN KEY(artifact_id, source_id) REFERENCES artifacts(id, source_id)
) STRICT;
CREATE INDEX observations_time ON observations(ingested_at, id);
CREATE INDEX observations_area_time ON observations(area_id, ingested_at, id);
CREATE INDEX observations_occurred ON observations(occurred_at, id);
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES areas(id),
  type TEXT NOT NULL CHECK(type IN ('scheduled','unplanned','unknown')),
  status TEXT NOT NULL CHECK(status IN ('reported','corroborated','official','ended','unknown')),
  start_at TEXT,
  end_at TEXT,
  start_basis TEXT NOT NULL CHECK(start_basis IN ('observed','reported','official','unknown')),
  end_basis TEXT NOT NULL CHECK(end_basis IN ('observed','reported','official','unknown')),
  last_evidence_at TEXT,
  confidence_explanation TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1)),
  CHECK(end_at IS NULL OR start_at IS NULL OR end_at >= start_at),
  CHECK(updated_at >= created_at)
) STRICT;
CREATE INDEX events_time ON events(updated_at, id);
CREATE INDEX events_area_time ON events(area_id, updated_at, id);
CREATE INDEX events_start ON events(start_at, id);
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  observation_id TEXT NOT NULL REFERENCES observations(id),
  relation TEXT NOT NULL CHECK(relation IN ('support','refute','retraction')),
  match_reason TEXT NOT NULL,
  human_reviewed INTEGER NOT NULL CHECK(human_reviewed IN (0,1)),
  synthetic INTEGER NOT NULL CHECK(synthetic IN (0,1)),
  UNIQUE(event_id, observation_id)
) STRICT;
CREATE INDEX evidence_observation ON evidence(observation_id);
