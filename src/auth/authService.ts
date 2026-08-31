import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { signAccessToken, verifyAccessToken, type JwtOptions } from './jwt.js';
import { decideRefresh, generateRefreshTokenValue, hashRefreshToken } from './refreshTokens.js';
import {
  createRefreshTokenFamily,
  findRefreshTokenByHash,
  revokeFamily,
  rotateRefreshToken,
} from './refreshTokensRepository.js';
import { findOrCreateVoter, findVoterById, type Voter } from './votersRepository.js';
import type { GoogleAuthProvider } from './googleProvider.js';

export interface AuthDependencies {
  db: Kysely<Database>;
  google: GoogleAuthProvider;
  jwt: JwtOptions;
}

export interface CallbackResult {
  voter: Voter;
  created: boolean;
  refreshTokenValue: string;
}

export async function beginLogin(
  deps: AuthDependencies,
  redirectUri: string,
): Promise<{ state: string; authorizationUrl: string }> {
  const state = generateRefreshTokenValue();
  const authorizationUrl = await deps.google.authorizationUrl({ state, redirectUri });
  return { state, authorizationUrl };
}

export async function completeCallback(
  deps: AuthDependencies,
  params: { callbackUrl: URL },
): Promise<CallbackResult> {
  const profile = await deps.google.exchangeCode(params);
  const { voter, created } = await findOrCreateVoter(deps.db, 'google', profile);

  const refreshTokenValue = generateRefreshTokenValue();
  await createRefreshTokenFamily(deps.db, voter.id, hashRefreshToken(refreshTokenValue));

  return { voter, created, refreshTokenValue };
}

export type RefreshResult =
  | { kind: 'refreshed'; jwt: string; refreshTokenValue: string }
  | { kind: 'reused' }
  | { kind: 'invalid' };

/** Exchanges a presented refresh token for a new JWT, rotating it (spec §5.2). */
export async function refresh(deps: AuthDependencies, presentedTokenValue: string): Promise<RefreshResult> {
  const stored = await findRefreshTokenByHash(deps.db, hashRefreshToken(presentedTokenValue));
  const decision = decideRefresh(stored, new Date());

  if (decision.kind === 'invalid') {
    return { kind: 'invalid' };
  }
  if (decision.kind === 'reuseDetected') {
    await revokeFamily(deps.db, decision.familyId);
    return { kind: 'reused' };
  }

  const newTokenValue = generateRefreshTokenValue();
  const rotated = await rotateRefreshToken(deps.db, decision.token, hashRefreshToken(newTokenValue));
  if (rotated.kind === 'lost-race') {
    // Another request already rotated this exact token concurrently — the
    // same signal as presenting an already-used token (spec §5.2).
    await revokeFamily(deps.db, decision.token.familyId);
    return { kind: 'reused' };
  }

  const jwt = await signAccessToken(rotated.token.voterId, deps.jwt);
  return { kind: 'refreshed', jwt, refreshTokenValue: newTokenValue };
}

/**
 * Logs out by revoking the whole refresh-token family (spec §5.2) — but only
 * when the presented refresh-token cookie actually belongs to the
 * authenticated voter making the request. A cookie naming a different
 * voter's family is silently ignored rather than acted on.
 */
export async function logout(deps: AuthDependencies, voterId: string, presentedTokenValue: string | undefined): Promise<void> {
  if (!presentedTokenValue) {
    return;
  }
  const stored = await findRefreshTokenByHash(deps.db, hashRefreshToken(presentedTokenValue));
  if (stored && stored.voterId === voterId) {
    await revokeFamily(deps.db, stored.familyId);
  }
}

export async function currentVoter(deps: AuthDependencies, authorizationHeader: string | undefined): Promise<Voter> {
  const voterId = await authenticatedVoterId(deps, authorizationHeader);
  const voter = await findVoterById(deps.db, voterId);
  if (!voter) {
    throw new Error('authenticated voter no longer exists');
  }
  return voter;
}

/** Verifies the Bearer JWT and returns the voter id it carries, or throws. */
export async function authenticatedVoterId(
  deps: AuthDependencies,
  authorizationHeader: string | undefined,
): Promise<string> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new Error('missing bearer token');
  }
  const token = authorizationHeader.slice('Bearer '.length);
  const payload = await verifyAccessToken(token, deps.jwt);
  return payload.voterId;
}
