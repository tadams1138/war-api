-- Up Migration

CREATE TABLE voters (
  id               UUID PRIMARY KEY,
  provider         VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(256) NOT NULL,
  display_name     VARCHAR(256),
  avatar_url       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE wars (
  id                UUID PRIMARY KEY,
  creator_id        UUID REFERENCES voters(id),
  title             VARCHAR(256) NOT NULL,
  category          VARCHAR(64),
  status            VARCHAR(16) NOT NULL DEFAULT 'draft',
  visibility        VARCHAR(16) NOT NULL DEFAULT 'public',
  media_mode        VARCHAR(8) NOT NULL DEFAULT 'image',
  contestant_schema JSONB NOT NULL DEFAULT '[]',
  ends_at           TIMESTAMPTZ,
  ui_slug           VARCHAR(64),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE contestants (
  id               UUID PRIMARY KEY,
  war_id           UUID REFERENCES wars(id),
  name             VARCHAR(256) NOT NULL,
  bio              TEXT,
  attributes       JSONB NOT NULL DEFAULT '{}',
  win_count        INT NOT NULL DEFAULT 0,
  appearance_count INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id               UUID PRIMARY KEY,
  voter_id         UUID REFERENCES voters(id),
  family_id        UUID NOT NULL,
  token_hash       TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (token_hash)
);

CREATE TABLE contestant_media (
  id                UUID PRIMARY KEY,
  contestant_id     UUID REFERENCES contestants(id),
  kind              VARCHAR(8) NOT NULL,
  display_order     INT NOT NULL DEFAULT 0,

  storage_key       TEXT,
  original_ext      VARCHAR(8),
  width             INT,
  height            INT,

  provider          VARCHAR(16),
  provider_video_id VARCHAR(64),
  start_seconds     INT,
  end_seconds       INT,
  duration_seconds  INT NOT NULL DEFAULT 0,
  poster_url        TEXT,
  title             TEXT,

  created_at        TIMESTAMPTZ DEFAULT now(),

  CHECK (
    (kind = 'image' AND storage_key IS NOT NULL)
    OR
    (kind = 'video' AND provider IS NOT NULL AND provider_video_id IS NOT NULL)
  )
);

CREATE TABLE matchups (
  id               UUID PRIMARY KEY,
  war_id           UUID REFERENCES wars(id),
  contestant_a_id  UUID REFERENCES contestants(id),
  contestant_b_id  UUID REFERENCES contestants(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (war_id, contestant_a_id, contestant_b_id),
  CHECK (contestant_a_id < contestant_b_id)
);

CREATE TABLE war_memberships (
  war_id           UUID REFERENCES wars(id),
  voter_id         UUID REFERENCES voters(id),
  joined_at        TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (war_id, voter_id)
);

CREATE TABLE votes (
  id                UUID PRIMARY KEY,
  matchup_id        UUID REFERENCES matchups(id),
  voter_id          UUID REFERENCES voters(id),
  winner_id         UUID REFERENCES contestants(id),
  presented_left_id UUID REFERENCES contestants(id) NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (matchup_id, voter_id)
);

CREATE INDEX ON votes (voter_id, matchup_id);
CREATE INDEX ON refresh_tokens (family_id);
CREATE INDEX ON contestant_media (contestant_id, display_order);
CREATE INDEX ON matchups (war_id);
CREATE INDEX ON contestants (war_id);
CREATE INDEX ON wars (status, visibility);
CREATE INDEX ON wars (ends_at) WHERE ends_at IS NOT NULL;

CREATE TABLE ui_registrations (
  slug             VARCHAR(64) PRIMARY KEY,
  label            VARCHAR(256),
  static_base_path TEXT NOT NULL,
  registered_at    TIMESTAMPTZ DEFAULT now()
);

-- Down Migration

DROP TABLE IF EXISTS ui_registrations;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS war_memberships;
DROP TABLE IF EXISTS matchups;
DROP TABLE IF EXISTS contestant_media;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS contestants;
DROP TABLE IF EXISTS wars;
DROP TABLE IF EXISTS voters;
