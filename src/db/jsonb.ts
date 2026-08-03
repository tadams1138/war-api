/**
 * node-postgres treats a bare JS array parameter as a Postgres array literal,
 * not JSON — so a jsonb column value must be pre-serialised to text and left
 * to Postgres's implicit text→jsonb cast, rather than passed as a raw
 * object/array. Reads need no matching unwrap: pg's default type parser for
 * json/jsonb (OIDs 114/3802) already returns parsed JS values.
 */
export function toJsonb(value: unknown): string {
  return JSON.stringify(value);
}
