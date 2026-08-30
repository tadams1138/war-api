export type ContestantFieldType = 'string' | 'number' | 'text' | 'url' | 'date';

export interface ContestantSchemaField {
  key: string;
  label: string;
  type: ContestantFieldType;
}

export interface ValidationOk<T> {
  ok: true;
  value: T;
}

export interface ValidationErr {
  ok: false;
  errors: string[];
}

export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

const MAX_FIELDS = 12;
const KEY_FORMAT = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_LABEL_LENGTH = 64;
const VALID_TYPES: ContestantFieldType[] = ['string', 'number', 'text', 'url', 'date'];

const MAX_STRING_LENGTH = 256;
const MAX_TEXT_LENGTH = 2000;
const MAX_URL_LENGTH = 512;

function err(errors: string[]): ValidationErr {
  return { ok: false, errors };
}

/**
 * Validates a War's `contestant_schema` declaration (spec §6).
 */
export function validateSchemaDefinition(schema: unknown): ValidationResult<ContestantSchemaField[]> {
  if (!Array.isArray(schema)) {
    return err(['contestant_schema must be an array']);
  }
  if (schema.length > MAX_FIELDS) {
    return err([`contestant_schema may declare at most ${MAX_FIELDS} fields`]);
  }

  const errors: string[] = [];
  const seenKeys = new Set<string>();
  const fields: ContestantSchemaField[] = [];

  for (const raw of schema) {
    const field = raw as Partial<ContestantSchemaField>;
    if (typeof field.key !== 'string' || !KEY_FORMAT.test(field.key)) {
      errors.push(`invalid field key: ${String(field.key)}`);
      continue;
    }
    if (seenKeys.has(field.key)) {
      errors.push(`duplicate field key: ${field.key}`);
      continue;
    }
    if (typeof field.label !== 'string' || field.label.length === 0 || field.label.length > MAX_LABEL_LENGTH) {
      errors.push(`invalid field label for key: ${field.key}`);
      continue;
    }
    if (typeof field.type !== 'string' || !VALID_TYPES.includes(field.type as ContestantFieldType)) {
      errors.push(`invalid field type for key: ${field.key}`);
      continue;
    }
    seenKeys.add(field.key);
    fields.push({ key: field.key, label: field.label, type: field.type as ContestantFieldType });
  }

  if (errors.length > 0) {
    return err(errors);
  }
  return { ok: true, value: fields };
}

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateValueForType(field: ContestantSchemaField, value: unknown): string | null {
  switch (field.type) {
    case 'string':
      if (typeof value !== 'string') return `${field.key} must be a string`;
      if (value.length > MAX_STRING_LENGTH) return `${field.key} exceeds ${MAX_STRING_LENGTH} characters`;
      return null;
    case 'text':
      if (typeof value !== 'string') return `${field.key} must be a string`;
      if (value.length > MAX_TEXT_LENGTH) return `${field.key} exceeds ${MAX_TEXT_LENGTH} characters`;
      return null;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${field.key} must be a number`;
      return null;
    case 'url':
      if (typeof value !== 'string') return `${field.key} must be a string`;
      if (value.length > MAX_URL_LENGTH) return `${field.key} exceeds ${MAX_URL_LENGTH} characters`;
      if (!isHttpOrHttpsUrl(value)) return `${field.key} must be an http or https URL`;
      return null;
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return `${field.key} must be a valid date`;
      return null;
  }
}

/**
 * Validates a contestant's `attributes` object against the War's declared
 * `contestant_schema` (spec §8.3). Every field is optional; a key outside the
 * schema, or a value of the wrong type, is rejected.
 */
export function validateAttributes(
  schema: ContestantSchemaField[],
  attributes: Record<string, unknown>,
): ValidationResult<Record<string, unknown>> {
  const byKey = new Map(schema.map((field) => [field.key, field]));
  const errors: string[] = [];

  for (const [key, value] of Object.entries(attributes)) {
    const field = byKey.get(key);
    if (!field) {
      errors.push(`unknown attribute key: ${key}`);
      continue;
    }
    const typeError = validateValueForType(field, value);
    if (typeError) {
      errors.push(typeError);
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }
  return { ok: true, value: attributes };
}

export interface ResolvedAttribute {
  key: string;
  label: string;
  type: ContestantFieldType;
  value: unknown;
}

/**
 * The response body JSON Schema for {@link ResolvedAttribute} (spec
 * §11.2.1). Registered under `$id: "ResolvedAttribute"`
 * (`registerSharedSchemas`, `src/openapi/schemas.ts`). Kept beside the
 * interface it mirrors -- see {@link mediaItemSchema} for why.
 */
export const resolvedAttributeSchema = {
  $id: 'ResolvedAttribute',
  type: 'object',
  required: ['key', 'label', 'type', 'value'],
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    type: { type: 'string', enum: VALID_TYPES },
    value: { type: ['string', 'number'] },
  },
};

/**
 * Resolves stored attributes against the schema so responses carry labels,
 * types, and values in schema order (spec §8.3). Keys the contestant never
 * supplied are omitted.
 */
export function resolveAttributes(
  schema: ContestantSchemaField[],
  attributes: Record<string, unknown>,
): ResolvedAttribute[] {
  return schema
    .filter((field) => Object.prototype.hasOwnProperty.call(attributes, field.key))
    .map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      value: attributes[field.key],
    }));
}
