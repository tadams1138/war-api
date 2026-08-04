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
