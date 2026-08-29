import { describe, expect, it } from 'vitest';
import {
  validateSchemaDefinition,
  validateAttributes,
  resolveAttributes,
  type ContestantSchemaField,
} from '../../src/contestants/schemaValidation.js';

const pageantSchema: ContestantSchemaField[] = [
  { key: 'country', label: 'Country', type: 'string' },
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'height', label: 'Height', type: 'string' },
];

describe('validateSchemaDefinition', () => {
  it('accepts a well-formed schema', () => {
    // Arrange
    const schema = pageantSchema;

    // Act
    const result = validateSchemaDefinition(schema);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('rejects more than 12 fields', () => {
    // Arrange
    const schema = Array.from({ length: 13 }, (_, i) => ({
      key: `field_${i}`,
      label: `Field ${i}`,
      type: 'string' as const,
    }));

    // Act
    const result = validateSchemaDefinition(schema);

    // Assert
    expect(result.ok).toBe(false);
  });

  it('rejects a key that does not match the required format', () => {
    // Arrange
    const schema = [{ key: 'Country', label: 'Country', type: 'string' as const }];

    // Act
    const result = validateSchemaDefinition(schema);

    // Assert
    expect(result.ok).toBe(false);
  });

  it('rejects a label longer than 64 characters', () => {
    // Arrange
    const schema = [{ key: 'country', label: 'x'.repeat(65), type: 'string' as const }];

    // Act
    const result = validateSchemaDefinition(schema);

    // Assert
    expect(result.ok).toBe(false);
  });

  it('rejects an unsupported type', () => {
    // Arrange
    const schema = [{ key: 'country', label: 'Country', type: 'boolean' }];

    // Act
    const result = validateSchemaDefinition(schema);

    // Assert
    expect(result.ok).toBe(false);
  });
});

describe('validateAttributes', () => {
  it('accepts values matching their declared types', () => {
    // Arrange
    const attributes = { country: 'Brazil', age: 24, height: '175cm' };

    // Act
    const result = validateAttributes(pageantSchema, attributes);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('rejects a key not present in the schema', () => {
    // Arrange
    const schema: ContestantSchemaField[] = [{ key: 'country', label: 'Country', type: 'string' }];
    const attributes = { party: 'Independent' };

    // Act
    const result = validateAttributes(schema, attributes);

    // Assert
    expect(result.ok).toBe(false);
  });

  it('rejects a value whose type does not match its declared type', () => {
    // Arrange
    const schema: ContestantSchemaField[] = [{ key: 'age', label: 'Age', type: 'number' }];
    const attributes = { age: 'twenty-four' };

    // Act
    const result = validateAttributes(schema, attributes);

    // Assert
    expect(result.ok).toBe(false);
  });

  it('rejects a javascript: url before it ever reaches storage', () => {
    // Arrange
    const schema: ContestantSchemaField[] = [{ key: 'website', label: 'Website', type: 'url' }];
    const attributes = { website: 'javascript:alert(1)' };

    // Act
    const result = validateAttributes(schema, attributes);

    // Assert
    expect(result.ok).toBe(false);
  });

  it('accepts http and https urls', () => {
    // Arrange
    const schema: ContestantSchemaField[] = [{ key: 'website', label: 'Website', type: 'url' }];
    const attributes = { website: 'https://example.com' };

    // Act
    const result = validateAttributes(schema, attributes);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('permits omitted fields', () => {
    // Arrange
    const attributes = { country: 'Brazil' };

    // Act
    const result = validateAttributes(pageantSchema, attributes);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('rejects a string value longer than 256 characters', () => {
    // Arrange
    const schema: ContestantSchemaField[] = [{ key: 'country', label: 'Country', type: 'string' }];
    const attributes = { country: 'x'.repeat(257) };

    // Act
    const result = validateAttributes(schema, attributes);

    // Assert
    expect(result.ok).toBe(false);
  });

  it('rejects a text value longer than 2000 characters', () => {
    // Arrange
    const schema: ContestantSchemaField[] = [{ key: 'bio', label: 'Bio', type: 'text' }];
    const attributes = { bio: 'x'.repeat(2001) };

    // Act
    const result = validateAttributes(schema, attributes);

    // Assert
    expect(result.ok).toBe(false);
  });

  it('rejects a url value longer than 512 characters', () => {
    // Arrange
    const schema: ContestantSchemaField[] = [{ key: 'website', label: 'Website', type: 'url' }];
    const attributes = { website: `https://example.com/${'x'.repeat(512)}` };

    // Act
    const result = validateAttributes(schema, attributes);

    // Assert
    expect(result.ok).toBe(false);
  });
});

describe('resolveAttributes', () => {
  it('resolves attributes in schema order with labels and values', () => {
    // Arrange
    const schema: ContestantSchemaField[] = [
      { key: 'country', label: 'Country', type: 'string' },
      { key: 'age', label: 'Age', type: 'number' },
    ];
    const attributes = { age: 24, country: 'Brazil' };

    // Act
    const resolved = resolveAttributes(schema, attributes);

    // Assert
    expect(resolved).toEqual([
      { key: 'country', label: 'Country', type: 'string', value: 'Brazil' },
      { key: 'age', label: 'Age', type: 'number', value: 24 },
    ]);
  });

  it('omits keys not supplied by the contestant', () => {
    // Arrange
    const attributes = { country: 'Brazil' };

    // Act
    const resolved = resolveAttributes(pageantSchema, attributes);

    // Assert
    expect(resolved).toEqual([{ key: 'country', label: 'Country', type: 'string', value: 'Brazil' }]);
  });
});
