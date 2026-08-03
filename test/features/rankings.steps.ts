import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import {
  activateWarForTest,
  joinWarAsVoter,
  makeDraftWarWithContestants,
  makeVoter,
} from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/rankings.feature', import.meta.url)));

async function setCounts(harness: TestHarness, contestantId: string, winCount: number, appearanceCount: number) {
  await harness.db
    .updateTable('contestants')
    .set({ win_count: winCount, appearance_count: appearanceCount })
    .where('id', '=', contestantId)
    .execute();
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('Anonymous user views public War rankings', ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a public War in "active" status', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, { visibility: 'public' });
      const activated = await activateWarForTest(harness.db, war);
      warId = activated.id;
    });

    When('an unauthenticated user GETs /wars/:id/rankings', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });
  });

  Scenario('Contestants are ranked by raw win count', ({ Given, When, Then }) => {
    let warId: string;
    let idA: string;
    let idB: string;
    let response: request.Response;

    Given('Contestant A has 320 wins and Contestant B has 300 wins', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      const activated = await activateWarForTest(harness.db, war);
      warId = activated.id;
      [idA, idB] = contestants.map((c) => c.id) as [string, string];
      await setCounts(harness, idA, 320, 400);
      await setCounts(harness, idB, 300, 400);
    });

    When('rankings are fetched', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('Contestant A ranks above Contestant B', () => {
      const ranks: Record<string, number> = {};
      for (const entry of response.body.rankings) {
        ranks[entry.contestant.id] = entry.rank;
      }
      expect(ranks[idA]!).toBeLessThan(ranks[idB]!);
    });
  });

  Scenario('Ties are broken by fewer appearances', ({ Given, And, When, Then }) => {
    let warId: string;
    let idA: string;
    let idB: string;
    let response: request.Response;

    Given('Contestants A and B both have 50 wins', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      const activated = await activateWarForTest(harness.db, war);
      warId = activated.id;
      [idA, idB] = contestants.map((c) => c.id) as [string, string];
    });

    And('Contestant A has 60 appearances and Contestant B has 80', async () => {
      await setCounts(harness, idA, 50, 60);
      await setCounts(harness, idB, 50, 80);
    });

    When('rankings are fetched', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('Contestant A ranks above Contestant B', () => {
      const ranks: Record<string, number> = {};
      for (const entry of response.body.rankings) {
        ranks[entry.contestant.id] = entry.rank;
      }
      expect(ranks[idA]!).toBeLessThan(ranks[idB]!);
    });
  });

  Scenario('A high win rate on few showings does not top the board', ({ Given, And, When, Then }) => {
    let warId: string;
    let idA: string;
    let idB: string;
    let response: request.Response;

    Given('Contestant A has 3 wins from 3 appearances', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      const activated = await activateWarForTest(harness.db, war);
      warId = activated.id;
      [idA, idB] = contestants.map((c) => c.id) as [string, string];
      await setCounts(harness, idA, 3, 3);
    });

    And('Contestant B has 320 wins from 400 appearances', async () => {
      await setCounts(harness, idB, 320, 400);
    });

    When('rankings are fetched', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('Contestant B ranks above Contestant A', () => {
      const ranks: Record<string, number> = {};
      for (const entry of response.body.rankings) {
        ranks[entry.contestant.id] = entry.rank;
      }
      expect(ranks[idB]!).toBeLessThan(ranks[idA]!);
    });
  });

  Scenario('Contestants with no appearances are unranked', ({ Given, When, Then, And }) => {
    let warId: string;
    let idC: string;
    let response: request.Response;

    Given('Contestant C has an appearance_count of 0', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      const activated = await activateWarForTest(harness.db, war);
      warId = activated.id;
      idC = contestants[1]!.id;
      await setCounts(harness, contestants[0]!.id, 5, 10);
    });

    When('rankings are fetched', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('Contestant C appears at the bottom', () => {
      const lastEntry = response.body.rankings.at(-1);
      expect(lastEntry.contestant.id).toBe(idC);
    });

    And('its rank is null', () => {
      const entry = response.body.rankings.find((r: { contestant: { id: string } }) => r.contestant.id === idC);
      expect(entry.rank).toBeNull();
    });
  });

  Scenario('Exposure stays balanced as a War progresses', ({ Given, When, Then }) => {
    let warId: string;
    let voterId: string;

    Given('an active War that has received several hundred votes', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 5);
      const activated = await activateWarForTest(harness.db, war);
      warId = activated.id;

      // 5 contestants → 10 pairs; simulate many voters so appearance_counts
      // accumulate while pair selection keeps them balanced (spec §9.1).
      for (let i = 0; i < 30; i += 1) {
        const voter = await makeVoter(harness.db, `voter-${i}`);
        await joinWarAsVoter(harness.db, warId, voter.id);
        voterId = voter.id;
        await harness.app.ready();
        for (;;) {
          const jwt = await harness.jwtFor(voter.id);
          const next = await request(harness.app.server)
            .get(`/api/v1/wars/${warId}/matchups/next`)
            .set('Authorization', `Bearer ${jwt}`);
          if (next.status === 204) break;
          await request(harness.app.server)
            .post(`/api/v1/wars/${warId}/matchups/${next.body.matchup.id}/vote`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ winner_id: next.body.matchup.left.id });
        }
      }
    });

    When("contestants' appearance_counts are compared", async () => {
      // Assertion performed in Then; this step exists for readability only.
      expect(voterId).toBeTruthy();
    });

    Then('they are clustered within a narrow range', async () => {
      const rows = await harness.db.selectFrom('contestants').selectAll().where('war_id', '=', warId).execute();
      const counts = rows.map((r) => r.appearance_count);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    });
  });

  Scenario('Rankings are cacheable for public Wars', ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a public War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const war = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, { visibility: 'public' });
      const activated = await activateWarForTest(harness.db, war.war);
      warId = activated.id;
    });

    When('rankings are fetched', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('the response sets Cache-Control public with max-age 30', () => {
      expect(response.headers['cache-control']).toBe('public, max-age=30');
    });
  });

  Scenario('Invite-only rankings are not stored in a shared cache', ({ Given, When, Then }) => {
    let warId: string;
    let memberId: string;
    let response: request.Response;

    Given('an invite_only War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, { visibility: 'invite_only' });
      const activated = await activateWarForTest(harness.db, war);
      warId = activated.id;
      const member = await makeVoter(harness.db, 'member');
      memberId = member.id;
      await joinWarAsVoter(harness.db, warId, memberId);
    });

    When('rankings are fetched by a member', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(memberId);
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}/rankings`).set('Authorization', `Bearer ${jwt}`);
    });

    Then('the response sets Cache-Control private', () => {
      expect(response.headers['cache-control']).toContain('private');
    });
  });

  Scenario('Invite-only War rankings blocked for anonymous users', ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('an invite_only War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, { visibility: 'invite_only' });
      const activated = await activateWarForTest(harness.db, war);
      warId = activated.id;
    });

    When('an unauthenticated user GETs rankings', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('the response status is 401', () => {
      expect(response.status).toBe(401);
    });
  });
});
