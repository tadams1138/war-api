import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildAppWithoutDb } from '../setup/testAppNoDb.js';

/**
 * Adding `schema.body` to `POST /wars/:id/matchups/:mId/vote` (spec §11.2.1)
 * moved rejection of a malformed body from `castVoteForVoter`'s own
 * `invalidWinner` (422, `{ "error": ... }`) to Fastify's ajv validator (400,
 * `{ statusCode, code, error, message }`) -- a real, observable behavior
 * change for any client sending a missing or non-UUID `winner_id`. Runs
 * DB-free: Fastify's request lifecycle validates the body before the
 * `preHandler` that requires a bearer token even runs, so this never reaches
 * `requireAuth`, `castVoteForVoter`, or the database.
 */
describe('POST /wars/:id/matchups/:mId/vote request body validation', () => {
  it('rejects a missing winner_id with Fastify\'s validation envelope', async () => {
    // Arrange
    const harness = await buildAppWithoutDb();
    await harness.app.ready();

    // Act
    const response = await request(harness.app.server)
      .post('/api/v1/wars/war-1/matchups/matchup-1/vote')
      .send({});

    // Assert
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ statusCode: 400, code: 'FST_ERR_VALIDATION', error: 'Bad Request' });
    expect(response.body.message).toEqual(expect.any(String));
  });

  it('rejects a non-UUID winner_id with Fastify\'s validation envelope', async () => {
    // Arrange
    const harness = await buildAppWithoutDb();
    await harness.app.ready();

    // Act
    const response = await request(harness.app.server)
      .post('/api/v1/wars/war-1/matchups/matchup-1/vote')
      .send({ winner_id: 'not-a-uuid' });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'FST_ERR_VALIDATION' });
  });
});
