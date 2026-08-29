import { SignJWT, jwtVerify } from 'jose';

export interface JwtOptions {
  secret: string;
  issuer: string;
}

export interface AccessTokenPayload {
  voterId: string;
  exp?: number;
}

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h, spec §5

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Issues a signed JWT (1h expiry) carrying the voter's id (spec §5). */
export async function signAccessToken(voterId: string, options: JwtOptions): Promise<string> {
  return new SignJWT({ voterId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(options.issuer)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key(options.secret));
}

/** Verifies a JWT's signature, issuer, and expiry, returning its payload. */
export async function verifyAccessToken(token: string, options: JwtOptions): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, key(options.secret), { issuer: options.issuer });
  if (typeof payload.voterId !== 'string') {
    throw new Error('JWT payload missing voterId');
  }
  return { voterId: payload.voterId, exp: payload.exp };
}
