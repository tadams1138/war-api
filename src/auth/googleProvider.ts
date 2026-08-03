import * as client from 'openid-client';

export interface OAuthProfile {
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * The one piece of the OAuth flow that is a genuine external dependency: a
 * network round-trip to Google. Everything else — state handling, cookie
 * delivery, JWT issuance, voter upsert — is this service's own logic and is
 * exercised directly in tests. Only this boundary is swapped for a test
 * double, because a test cannot honestly drive a real Google login.
 */
export interface GoogleAuthProvider {
  authorizationUrl(params: { state: string; redirectUri: string }): Promise<string>;
  exchangeCode(params: { code: string; redirectUri: string }): Promise<OAuthProfile>;
}

export class RealGoogleAuthProvider implements GoogleAuthProvider {
  private readonly configuration: Promise<client.Configuration>;

  constructor(clientId: string, clientSecret: string) {
    this.configuration = client.discovery(new URL('https://accounts.google.com'), clientId, clientSecret);
  }

  async authorizationUrl(params: { state: string; redirectUri: string }): Promise<string> {
    const config = await this.configuration;
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: params.redirectUri,
      scope: 'openid email profile',
      state: params.state,
    });
    return url.href;
  }

  async exchangeCode(params: { code: string; redirectUri: string }): Promise<OAuthProfile> {
    const config = await this.configuration;
    const currentUrl = new URL(params.redirectUri);
    currentUrl.searchParams.set('code', params.code);
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      expectedState: client.skipStateCheck,
    });
    const claims = tokens.claims();
    const subject = claims?.sub;
    if (!subject) {
      throw new Error('Google did not return a subject claim');
    }
    const userinfo = await client.fetchUserInfo(config, tokens.access_token, subject);
    return {
      providerUserId: userinfo.sub,
      displayName: typeof userinfo.name === 'string' ? userinfo.name : null,
      avatarUrl: typeof userinfo.picture === 'string' ? userinfo.picture : null,
    };
  }
}
