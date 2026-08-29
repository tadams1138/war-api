import { randomBytes, createHash } from 'node:crypto';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, spec §5

export interface StoredRefreshToken {
  id: string;
  voterId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** Generates a new opaque refresh-token value. Never stored in plaintext (spec §5). */
export function generateRefreshTokenValue(): string {
  return randomBytes(32).toString('base64url');
}

/** Hashes a refresh-token value for storage/lookup (spec §5: SHA-256). */
export function hashRefreshToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export type RefreshDecision =
  | { kind: 'rotate'; token: StoredRefreshToken }
  | { kind: 'reuseDetected'; familyId: string }
  | { kind: 'invalid' };

/**
 * Decides what a presented refresh token means (spec §5.2):
 * - unknown, expired, or already-revoked ⇒ invalid (401)
 * - already used ⇒ reuse detected, revoke the whole family (401)
 * - otherwise ⇒ rotate: mark used, issue a successor in the same family
 */
export function decideRefresh(stored: StoredRefreshToken | undefined, now: Date): RefreshDecision {
  if (!stored) {
    return { kind: 'invalid' };
  }
  if (stored.expiresAt.getTime() <= now.getTime()) {
    return { kind: 'invalid' };
  }
  if (stored.revokedAt !== null) {
    return { kind: 'invalid' };
  }
  if (stored.usedAt !== null) {
    return { kind: 'reuseDetected', familyId: stored.familyId };
  }
  return { kind: 'rotate', token: stored };
}
