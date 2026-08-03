import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from '../../src/auth/jwt.js';

const secret = 'unit-test-secret';
const issuer = 'war-api-test';

describe('jwt', () => {
  it('round-trips the voter id through sign and verify', async () => {
    // Arrange
    const voterId = '11111111-1111-1111-1111-111111111111';

    // Act
    const token = await signAccessToken(voterId, { secret, issuer });
    const payload = await verifyAccessToken(token, { secret, issuer });

    // Assert
    expect(payload.voterId).toBe(voterId);
  });

  it('expires in 1 hour as specified', async () => {
    // Arrange
    const voterId = '11111111-1111-1111-1111-111111111111';
    const before = Math.floor(Date.now() / 1000);

    // Act
    const token = await signAccessToken(voterId, { secret, issuer });
    const payload = await verifyAccessToken(token, { secret, issuer });

    // Assert
    expect(payload.exp).toBeDefined();
    expect(payload.exp! - before).toBeGreaterThanOrEqual(3599);
    expect(payload.exp! - before).toBeLessThanOrEqual(3601);
  });

  it('rejects a token signed with a different secret', async () => {
    // Arrange
    const voterId = '11111111-1111-1111-1111-111111111111';
    const token = await signAccessToken(voterId, { secret: 'other-secret', issuer });

    // Act & Assert
    await expect(verifyAccessToken(token, { secret, issuer })).rejects.toThrow();
  });

  it('rejects a malformed token', async () => {
    // Arrange
    const token = 'not-a-jwt';

    // Act & Assert
    await expect(verifyAccessToken(token, { secret, issuer })).rejects.toThrow();
  });
});
