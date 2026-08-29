import type { GoogleAuthProvider, OAuthProfile } from '../../src/auth/googleProvider.js';

/**
 * A test double for the one genuinely external hop in the OAuth flow: the
 * network round-trip to Google. Everything else in auth.feature (state
 * cookie handling, voter upsert, JWT issuance, refresh rotation) runs
 * through the real service code against a real database.
 */
export class FakeGoogleAuthProvider implements GoogleAuthProvider {
  private readonly profilesByCode = new Map<string, OAuthProfile>();

  registerCode(code: string, profile: OAuthProfile): void {
    this.profilesByCode.set(code, profile);
  }

  async authorizationUrl(params: { state: string; redirectUri: string }): Promise<string> {
    return `https://accounts.google.test/o/authorize?state=${encodeURIComponent(params.state)}&redirect_uri=${encodeURIComponent(params.redirectUri)}`;
  }

  async exchangeCode(params: { code: string; redirectUri: string }): Promise<OAuthProfile> {
    const profile = this.profilesByCode.get(params.code);
    if (!profile) {
      throw new Error(`no fake Google profile registered for code "${params.code}"`);
    }
    return profile;
  }
}
