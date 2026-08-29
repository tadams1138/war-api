import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { findWarById } from '../../src/wars/warsRepository.js';
import { countMatchupsForWar } from '../../src/matchups/matchupsRepository.js';
import { makeVoter, makeDraftWarWithContestants } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/war-lifecycle.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('Creator activates a War with enough contestants', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War in "draft" status with 3 contestants, each with an image', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 3);
      warId = war.id;
    });

    When('the creator POSTs to /api/v1/wars/:id/activate', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/activate`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the War status becomes "active"', () => {
      expect(response.status).toBe(200);
      expect((response.body as { status: string }).status).toBe('active');
    });

    And('exactly 3 matchups are generated', async () => {
      const count = await countMatchupsForWar(harness.db, warId);
      expect(count).toBe(3);
    });
  });

  Scenario('Cannot activate with fewer than 2 contestants', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War in "draft" with 1 contestant', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 1);
      warId = war.id;
    });

    When('the creator POSTs to activate', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/activate`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('the War remains "draft"', async () => {
      const war = await findWarById(harness.db, warId);
      expect(war?.status).toBe('draft');
    });
  });

  Scenario('Cannot edit after activation', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War in "active" status', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server).post(`/api/v1/wars/${war.id}/activate`).set('Authorization', `Bearer ${jwt}`).send();
      warId = war.id;
    });

    When('the creator PATCHes the title', async () => {
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .patch(`/api/v1/wars/${warId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ title: 'New Title' });
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('Non-creator cannot activate', ({ Given, When, Then }) => {
    let warId: string;
    let voterBId: string;
    let response: request.Response;

    Given('a War created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      const voterB = await makeVoter(harness.db, 'voter-b');
      voterBId = voterB.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, voterA.id, 2);
      warId = war.id;
    });

    When('Voter B POSTs to activate', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterBId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/activate`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('A voter joins an active War', ({ Given, And, When, Then }) => {
    let warId: string;
    let voterId: string;

    Given('an active War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await harness.app.ready();
      const jwt = await harness.jwtFor(creator.id);
      await request(harness.app.server).post(`/api/v1/wars/${war.id}/activate`).set('Authorization', `Bearer ${jwt}`).send();
      warId = war.id;
    });

    And('an authenticated voter who has not joined', async () => {
      const voter = await makeVoter(harness.db, 'joiner');
      voterId = voter.id;
    });

    When('they POST to /api/v1/wars/:id/join', async () => {
      const jwt = await harness.jwtFor(voterId);
      await request(harness.app.server).post(`/api/v1/wars/${warId}/join`).set('Authorization', `Bearer ${jwt}`).send();
    });

    Then('a war_membership record is created for that voter and War', async () => {
      const row = await harness.db
        .selectFrom('war_memberships')
        .selectAll()
        .where('war_id', '=', warId)
        .where('voter_id', '=', voterId)
        .executeTakeFirst();
      expect(row).toBeDefined();
    });
  });
});
