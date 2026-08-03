import { createHash } from 'node:crypto';

/**
 * The stable, per-voter shuffle key named in the spec's pair-selection query
 * (§8.4): `md5(matchup_id || voter_id)`. Deterministic for a given
 * (matchup, voter) pair; never uses `random()`.
 */
export function stableHash(matchupId: string, voterId: string): string {
  return createHash('md5').update(`${matchupId}${voterId}`).digest('hex');
}

/**
 * Side randomisation (§8.4): `left = contestant_a if hash(matchup_id ||
 * voter_id || 'side') is even`. The digest is a base-16 integer; because 16 is
 * even, every digit place except the last contributes an even amount, so the
 * last hex digit alone determines the whole digest's parity.
 */
export function isLeftSide(matchupId: string, voterId: string): boolean {
  const digest = createHash('md5').update(`${matchupId}${voterId}side`).digest('hex');
  const lastNibble = parseInt(digest.at(-1) as string, 16);
  return lastNibble % 2 === 0;
}
