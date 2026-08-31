import { describe, expect, it } from 'vitest';
import {
  assertProductionConfig,
  defaultPublicBaseUrl,
  DEFAULT_UI_ORIGIN,
  loadConfig,
  type AppConfig,
} from '../../src/config.js';

function fullyPopulatedConfig(): AppConfig {
  return loadConfig({
    DATABASE_URL: 'postgres://user:pass@host:5432/db',
    JWT_SECRET: 'a-real-production-secret',
    INTERNAL_TASK_TOKEN: 'a-real-internal-task-token',
    GOOGLE_CLIENT_ID: 'a-real-client-id',
    GOOGLE_CLIENT_SECRET: 'a-real-client-secret',
    PUBLIC_BASE_URL: 'https://staging.war.tmad.dev',
    UI_ORIGINS: 'https://staging.war.tmad.dev',
  } as NodeJS.ProcessEnv);
}

describe('assertProductionConfig', () => {
  it('throws when no environment variables are set and every secret defaults', () => {
    // Arrange
    const config = loadConfig({} as NodeJS.ProcessEnv);

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow();
  });

  it('throws when JWT_SECRET is left at its published test default', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.jwtSecret = 'test-secret-do-not-use-in-production';

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow(/jwt/i);
  });

  it('throws when INTERNAL_TASK_TOKEN is left at its published test default', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.internalTaskToken = 'test-internal-token';

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow(/internal/i);
  });

  it('throws when DATABASE_URL is unset', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.databaseUrl = '';

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow();
  });

  it('throws when Google client credentials are unset', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.google.clientId = '';
    config.google.clientSecret = '';

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow();
  });

  it('does not throw for a fully-populated production config', () => {
    // Arrange
    const config = fullyPopulatedConfig();

    // Act & Assert
    expect(() => assertProductionConfig(config)).not.toThrow();
  });

  it('throws when apiBaseUrl is left at its localhost default for the configured port', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.apiBaseUrl = defaultPublicBaseUrl(config.port);

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow(/public.*base.*url/i);
  });

  it('throws when apiBaseUrl is the empty string', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.apiBaseUrl = '';

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow();
  });

  it('does not throw when apiBaseUrl is a real, non-default value, and google.redirectUri is derived from it', () => {
    // Arrange
    const config = fullyPopulatedConfig();

    // Act & Assert
    expect(() => assertProductionConfig(config)).not.toThrow();
    expect(config.apiBaseUrl).toBe('https://staging.war.tmad.dev');
    expect(config.google.redirectUri).toBe('https://staging.war.tmad.dev/api/v1/auth/google/callback');
  });

  it('throws when apiBaseUrl has a trailing slash', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.apiBaseUrl = 'https://staging.war.tmad.dev/';

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow(/trailing slash/i);
  });

  it('throws when apiBaseUrl does not parse as an absolute http(s) URL', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.apiBaseUrl = 'not-a-url';

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow(/absolute http/i);
  });

  it('throws when uiOrigins is left at its localhost default', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.uiOrigins = [DEFAULT_UI_ORIGIN];

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow(/ui_origins/i);
  });

  it('throws when uiOrigins is empty', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.uiOrigins = [];

    // Act & Assert
    expect(() => assertProductionConfig(config)).toThrow(/ui_origins/i);
  });

  it('does not throw when uiOrigins is a real, non-default value', () => {
    // Arrange
    const config = fullyPopulatedConfig();

    // Act & Assert
    expect(() => assertProductionConfig(config)).not.toThrow();
    expect(config.uiOrigins).toEqual(['https://staging.war.tmad.dev']);
  });
});
