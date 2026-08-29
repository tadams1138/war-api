import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { findWarById } from '../../src/wars/warsRepository.js';
import { makeVoter, makeDraftWarWithContestants, joinWarAsVoter, activateWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/war-expiry.feature', import.meta.url)));

const INTERNAL_TOKEN = 'test-internal-token';

async function setEndsAt(harness: TestHarness, warId: string, endsAt: Date | null) {
  await harness.db.updateTable('wars').set({ ends_at: endsAt }).where('id', '=', warId).execute();
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('An expired War reports as closed before the close task runs', ({ Given, And, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('an active War whose ends_at passed one minute ago', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await activateWarForTest(harness.db, war);
      await setEndsAt(harness, war.id, new Date(Date.now() - 60_000));
      warId = war.id;
    });

    And('the close-expired-wars task has not yet run', () => {
      // No-op: this test never calls the internal endpoint.
    });

    When('anyone GETs /api/v1/wars/:id', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}`);
    });

    Then('the response status field is "closed"', () => {
      expect((response.body as { status: string }).status).toBe('closed');
    });
  });

  Scenario('Voting is rejected the moment a War expires', ({ Given, And, When, Then }) => {
    let warId: string;
    let matchupId: string;
    let voterId: string;

    Given('an active War whose ends_at passed one second ago', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await activateWarForTest(harness.db, war);
      const matchup = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', war.id).executeTakeFirstOrThrow();
      matchupId = matchup.id;
      const voter = await makeVoter(harness.db, 'voter');
      voterId = voter.id;
      await joinWarAsVoter(harness.db, war.id, voterId);
      await setEndsAt(harness, war.id, new Date(Date.now() - 1000));
      warId = war.id;
    });

    And('the close-expired-wars task has not yet run', () => {
      // No-op.
    });

    let response: request.Response;

    When('a joined voter POSTs a vote', async () => {
      await harness.app.ready();
      const matchup = await harness.db.selectFrom('matchups').selectAll().where('id', '=', matchupId).executeTakeFirstOrThrow();
      const jwt = await harness.jwtFor(voterId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/matchups/${matchupId}/vote`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ winner_id: matchup.contestant_a_id });
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('A War with no end date never expires', ({ Given, When, Then }) => {
    let warId: string;

    Given('an active War with ends_at set to NULL', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await activateWarForTest(harness.db, war);
      warId = war.id;
    });

    When('the close-expired-wars task runs', async () => {
      await harness.app.ready();
      await request(harness.app.server).post('/api/v1/internal/close-expired-wars').set('X-Internal-Token', INTERNAL_TOKEN).send();
    });

    Then('the War remains "active"', async () => {
      const war = await findWarById(harness.db, warId);
      expect(war?.status).toBe('active');
    });
  });

  Scenario('The close task materialises the stored status', ({ Given, When, Then, And }) => {
    let warId: string;
    let response: request.Response;

    Given('an active War whose ends_at passed six hours ago', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await activateWarForTest(harness.db, war);
      await setEndsAt(harness, war.id, new Date(Date.now() - 6 * 60 * 60 * 1000));
      warId = war.id;
    });

    When('the close-expired-wars task runs', async () => {
      await harness.app.ready();
      response = await request(harness.app.server)
        .post('/api/v1/internal/close-expired-wars')
        .set('X-Internal-Token', INTERNAL_TOKEN)
        .send();
    });

    Then('the stored status column becomes "closed"', async () => {
      const war = await findWarById(harness.db, warId);
      expect(war?.status).toBe('closed');
    });

    And('the response reports 1 War closed', () => {
      expect(response.status).toBe(200);
      expect((response.body as { closed: number }).closed).toBe(1);
    });
  });

  Scenario('The close task is idempotent', ({ Given, When, Then, And }) => {
    let response: request.Response;

    Given('the close-expired-wars task has already closed all expired Wars', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await activateWarForTest(harness.db, war);
      await setEndsAt(harness, war.id, new Date(Date.now() - 6 * 60 * 60 * 1000));
      await harness.app.ready();
      await request(harness.app.server).post('/api/v1/internal/close-expired-wars').set('X-Internal-Token', INTERNAL_TOKEN).send();
    });

    When('it runs again', async () => {
      response = await request(harness.app.server).post('/api/v1/internal/close-expired-wars').set('X-Internal-Token', INTERNAL_TOKEN).send();
    });

    Then('zero Wars are modified', () => {
      expect((response.body as { closed: number }).closed).toBe(0);
    });

    And('the response status is 200', () => {
      expect(response.status).toBe(200);
    });
  });

  Scenario('Internal endpoints reject a missing or wrong token', ({ When, Then, And }) => {
    let response: request.Response;
    let warsBefore: unknown[];

    When('POST /api/v1/internal/close-expired-wars is called without a valid X-Internal-Token', async () => {
      warsBefore = await harness.db.selectFrom('wars').selectAll().execute();
      await harness.app.ready();
      response = await request(harness.app.server)
        .post('/api/v1/internal/close-expired-wars')
        .set('X-Internal-Token', 'wrong-token')
        .send();
    });

    Then('the response status is 401', () => {
      expect(response.status).toBe(401);
    });

    And('no War records are modified', async () => {
      const warsAfter = await harness.db.selectFrom('wars').selectAll().execute();
      expect(warsAfter).toEqual(warsBefore);
    });
  });

  Scenario('Internal endpoints do not accept user JWTs', ({ Given, When, Then }) => {
    let jwt: string;
    let response: request.Response;

    Given('a valid user JWT for any voter', async () => {
      const voter = await makeVoter(harness.db, 'someone');
      jwt = await harness.jwtFor(voter.id);
    });

    When('POST /api/v1/internal/close-expired-wars is called with that JWT and no internal token', async () => {
      await harness.app.ready();
      response = await request(harness.app.server)
        .post('/api/v1/internal/close-expired-wars')
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the response status is 401', () => {
      expect(response.status).toBe(401);
    });
  });
});
