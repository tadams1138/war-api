/**
 * Route-level schema fragment marking an operation as requiring the bearer
 * JWT (spec §11.2: "every path marked 🔒 ... carries a
 * `security: [{ bearerAuth: [] }]` requirement"). Spread into a route's
 * `schema` option alongside `requireAuth` so the generated OpenAPI document
 * and the actual auth check can never drift apart.
 */
export const requiresBearerAuth = { security: [{ bearerAuth: [] }] } as const;
