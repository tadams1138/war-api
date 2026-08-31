import type { GoogleAuthProvider, OAuthProfile } from '../../src/auth/googleProvider.js';

/**
 * A test double for the one genuinely external hop in the OAuth flow: the
 * network round-trip to Google. Everything else in auth.feature (state
 * cookie handling, voter upsert, JWT issuance, refresh rotation) runs
 * through the real service code against a real database.
 */
export class FakeGoogleAuthProvider implements GoogleAuthProvider {
  private readonly profilesByCode = new Map<string, OAuthProfile>();

  /**
   * The `callbackUrl` most recently passed to `exchangeCode`, so tests can
   * observe the exact URL that would have gone into the real token-exchange
   * request to Google -- which validates params straight off it (e.g. RFC
   * 9207's `iss`), not just `redirect_uri` -- without a new harness.
   */
  lastExchangeCallbackUrl: URL | undefined;

  /** Set via {@link failNextExchange}: thrown by the next `exchangeCode` call instead of resolving a profile. */
  private nextExchangeError: Error | undefined;

  registerCode(code: string, profile: OAuthProfile): void {
    this.profilesByCode.set(code, profile);
  }

  /**
   * Makes the next `exchangeCode` call throw `error` instead of resolving a
   * profile -- standing in for a network failure to Google, or an
   * `openid-client`/`oauth4webapi` validation error against Google's
   * response (spec §4.1 #4), so tests can exercise the callback route's
   * error boundary honestly.
   */
  failNextExchange(error: Error): void {
    this.nextExchangeError = error;
  }

  async authorizationUrl(params: { state: string; redirectUri: string }): Promise<string> {
    return `https://accounts.google.test/o/authorize?state=${encodeURIComponent(params.state)}&redirect_uri=${encodeURIComponent(params.redirectUri)}`;
  }

  async exchangeCode(params: { callbackUrl: URL }): Promise<OAuthProfile> {
    this.lastExchangeCallbackUrl = params.callbackUrl;
    if (this.nextExchangeError) {
      const error = this.nextExchangeError;
      this.nextExchangeError = undefined;
      throw error;
    }
    const code = params.callbackUrl.searchParams.get('code');
    const profile = code ? this.profilesByCode.get(code) : undefined;
    if (!profile) {
      throw new Error(`no fake Google profile registered for code "${code}"`);
    }
    return profile;
  }
}
