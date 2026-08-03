import type { ColumnType, Generated } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface VotersTable {
  id: string;
  provider: string;
  provider_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: Generated<Timestamp>;
}

export interface WarsTable {
  id: string;
  creator_id: string | null;
  title: string;
  category: string | null;
  status: Generated<string>;
  visibility: Generated<string>;
  media_mode: Generated<string>;
  contestant_schema: Generated<unknown>;
  ends_at: Timestamp | null;
  ui_slug: string | null;
  created_at: Generated<Timestamp>;
}

export interface ContestantsTable {
  id: string;
  war_id: string;
  name: string;
  bio: string | null;
  attributes: Generated<unknown>;
  win_count: Generated<number>;
  appearance_count: Generated<number>;
  created_at: Generated<Timestamp>;
}

export interface RefreshTokensTable {
  id: string;
  voter_id: string;
  family_id: string;
  token_hash: string;
  expires_at: Timestamp;
  used_at: Timestamp | null;
  revoked_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface ContestantMediaTable {
  id: string;
  contestant_id: string;
  kind: string;
  display_order: Generated<number>;
  storage_key: string | null;
  original_ext: string | null;
  width: number | null;
  height: number | null;
  provider: string | null;
  provider_video_id: string | null;
  start_seconds: number | null;
  end_seconds: number | null;
  duration_seconds: Generated<number>;
  poster_url: string | null;
  title: string | null;
  created_at: Generated<Timestamp>;
}

export interface MatchupsTable {
  id: string;
  war_id: string;
  contestant_a_id: string;
  contestant_b_id: string;
  created_at: Generated<Timestamp>;
}

export interface WarMembershipsTable {
  war_id: string;
  voter_id: string;
  joined_at: Generated<Timestamp>;
}

export interface VotesTable {
  id: string;
  matchup_id: string;
  voter_id: string;
  winner_id: string;
  presented_left_id: string;
  created_at: Generated<Timestamp>;
}

export interface Database {
  voters: VotersTable;
  wars: WarsTable;
  contestants: ContestantsTable;
  refresh_tokens: RefreshTokensTable;
  contestant_media: ContestantMediaTable;
  matchups: MatchupsTable;
  war_memberships: WarMembershipsTable;
  votes: VotesTable;
}
