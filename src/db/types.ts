import type { ColumnType, Generated } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;

/**
 * A database-generated timestamp column (e.g. `created_at DEFAULT now()`):
 * always a `Date` on select, optionally `Date | string` on insert, `Date |
 * string` on update. Spelled out directly rather than as `Generated<Timestamp>`
 * — `Generated<S>` assumes `S` is a plain type, so wrapping the `Timestamp`
 * `ColumnType` in another `ColumnType` would double-wrap it and fail to
 * flatten to `Date` under Kysely's `Selectable<>` (used throughout the
 * repositories, design review finding 12).
 */
type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface VotersTable {
  id: string;
  provider: string;
  provider_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: GeneratedTimestamp;
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
  created_at: GeneratedTimestamp;
}

export interface ContestantsTable {
  id: string;
  war_id: string;
  name: string;
  bio: string | null;
  attributes: Generated<unknown>;
  win_count: Generated<number>;
  appearance_count: Generated<number>;
  created_at: GeneratedTimestamp;
}

export interface RefreshTokensTable {
  id: string;
  voter_id: string;
  family_id: string;
  token_hash: string;
  expires_at: Timestamp;
  used_at: Timestamp | null;
  revoked_at: Timestamp | null;
  created_at: GeneratedTimestamp;
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
  variant_widths: number[] | null;
  created_at: GeneratedTimestamp;
}

export interface MatchupsTable {
  id: string;
  war_id: string;
  contestant_a_id: string;
  contestant_b_id: string;
  created_at: GeneratedTimestamp;
}

export interface WarMembershipsTable {
  war_id: string;
  voter_id: string;
  joined_at: GeneratedTimestamp;
}

export interface VotesTable {
  id: string;
  matchup_id: string;
  voter_id: string;
  winner_id: string;
  presented_left_id: string;
  created_at: GeneratedTimestamp;
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
