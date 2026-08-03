export function extractCookieValue(setCookieHeaders: string[] | undefined, name: string): string | undefined {
  if (!setCookieHeaders) return undefined;
  for (const header of setCookieHeaders) {
    const [pair] = header.split(';');
    const [cookieName, ...rest] = pair!.split('=');
    if (cookieName === name) {
      return rest.join('=');
    }
  }
  return undefined;
}

export function findSetCookie(setCookieHeaders: string[] | undefined, name: string): string | undefined {
  return setCookieHeaders?.find((header) => header.startsWith(`${name}=`));
}

export function cookieHeader(pairs: Record<string, string | undefined>): string {
  return Object.entries(pairs)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}
