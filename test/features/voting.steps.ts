import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { Contestant } from '../../src/contestants/contestantsRepository.js';
import { stableHash } from '../../src/matchups/stableHash.js';
import type { War } from '../../src/wars/warsRepository.js';
import {
  activateWarForTest,
  joinWarAsVoter,
  makeDraftWarWithContestants,
  makeVoter,
} from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/voting.feature', import.meta.url)));

interface Setup {
  war: War;
  contestants: Contestant[];
  voterId: string;
}

async function setupActiveWarWithJoinedVoter(harness: TestHarness, contestantCount: number): Promise<Setup> {
  const creator = await makeVoter(harness.db, 'creator');
  const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, contestantCount);
  const activated = await activateWarForTest(harness.db, war);
  const voter = await makeVoter(harness.db, 'voter');
  await joinWarAsVoter(harness.db, activated.id, voter.id);
  return { war: activated, contestants, voterId: voter.id };
}

async function getNextMatchup(harness: TestHarness, warId: string, voterId: string) {
  await harness.app.ready();
  const jwt = await harness.jwtFor(voterId);
  return request(harness.app.server).get(`/api/v1/wars/${warId}/matchups/next`).set('Authorization', `Bearer ${jwt}`);
}

async function postVote(harness: TestHarness, warId: string, matchupId: string, voterId: string, winnerId: string) {
  await harness.app.ready();
  const jwt = await harness.jwtFor(voterId);
  return request(harness.app.server)
    .post(`/api/v1/wars/${warId}/matchups/${matchupId}/vote`)
    .set('Authorization', `Bearer ${jwt}`)
    .send({ winner_id: winnerId });
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('Voter casts a vote', ({ Given, And, When, Then }) => {
    let setup: Setup;
    let matchupId: string;
    let winnerId: string;
    let voteResponse: request.Response;

    Given('a voter who joined an active War', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 2);
    });

    And('matchup M has not been voted on by this voter', async () => {
      const next = await getNextMatchup(harness, setup.war.id, setup.voterId);
      matchupId = next.body.matchup.id;
      winnerId = next.body.matchup.left.id;
    });

    When('they POST /vote with a valid winner_id', async () => {
      voteResponse = await postVote(harness, setup.war.id, matchupId, setup.voterId, winnerId);
    });

    Then('a Vote record is created', () => {
      expect(voteResponse.status).toBe(201);
    });

    And("the winner's win_count increases by 1", async () => {
      const winner = await harness.db.selectFrom('contestants').selectAll().where('id', '=', winnerId).executeTakeFirstOrThrow();
      expect(winner.win_count).toBe(1);
    });

    And("both contestants' appearance_count increase by 1", async () => {
      const rows = await harness.db.selectFrom('contestants').selectAll().where('war_id', '=', setup.war.id).execute();
      for (const row of rows) {
        expect(row.appearance_count).toBe(1);
      }
    });
  });

  Scenario('A vote is final', ({ Given, When, Then, And }) => {
    let setup: Setup;
    let matchupId: string;
    let contestantA: string;
    let contestantB: string;
    let response: request.Response;

    Given('a voter who voted Contestant A in matchup M', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 2);
      const next = await getNextMatchup(harness, setup.war.id, setup.voterId);
      matchupId = next.body.matchup.id;
      contestantA = next.body.matchup.left.id;
      contestantB = next.body.matchup.right.id;
      await postVote(harness, setup.war.id, matchupId, setup.voterId, contestantA);
    });

    When('they POST /vote for matchup M with winner_id = Contestant B', async () => {
      response = await postVote(harness, setup.war.id, matchupId, setup.voterId, contestantB);
    });

    Then('the response status is 409', () => {
      expect(response.status).toBe(409);
    });

    And('no new Vote record is created', async () => {
      const rows = await harness.db.selectFrom('votes').selectAll().where('matchup_id', '=', matchupId).execute();
      expect(rows).toHaveLength(1);
    });

    And('no counters change', async () => {
      const a = await harness.db.selectFrom('contestants').selectAll().where('id', '=', contestantA).executeTakeFirstOrThrow();
      expect(a.win_count).toBe(1);
      expect(a.appearance_count).toBe(1);
    });
  });

  Scenario('Re-submitting the same vote is treated as a retry', ({ Given, When, Then, And }) => {
    let setup: Setup;
    let matchupId: string;
    let contestantA: string;
    let response: request.Response;

    Given('a voter who voted Contestant A in matchup M', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 2);
      const next = await getNextMatchup(harness, setup.war.id, setup.voterId);
      matchupId = next.body.matchup.id;
      contestantA = next.body.matchup.left.id;
      await postVote(harness, setup.war.id, matchupId, setup.voterId, contestantA);
    });

    When('they POST /vote for matchup M with winner_id = Contestant A again', async () => {
      response = await postVote(harness, setup.war.id, matchupId, setup.voterId, contestantA);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('no new Vote record is created', async () => {
      const rows = await harness.db.selectFrom('votes').selectAll().where('matchup_id', '=', matchupId).execute();
      expect(rows).toHaveLength(1);
    });

    And('no counters change', async () => {
      const a = await harness.db.selectFrom('contestants').selectAll().where('id', '=', contestantA).executeTakeFirstOrThrow();
      expect(a.win_count).toBe(1);
      expect(a.appearance_count).toBe(1);
    });
  });

  Scenario('A pairing has no direction', ({ Given, Then, And }) => {
    let setup: Setup;

    Given('contestants A and B in an active War', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 2);
    });

    Then('exactly one matchup exists for that pair', async () => {
      const rows = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', setup.war.id).execute();
      expect(rows).toHaveLength(1);
    });

    And('attempting to insert the mirrored pairing violates a constraint', async () => {
      const [a, b] = [...setup.contestants].sort((x, y) => (x.id < y.id ? -1 : 1));
      await expect(
        harness.db
          .insertInto('matchups')
          .values({
            id: crypto.randomUUID(),
            war_id: setup.war.id,
            contestant_a_id: b!.id,
            contestant_b_id: a!.id,
          })
          .execute(),
      ).rejects.toThrow();
    });
  });

  Scenario('A voter is never served a pair they have voted on', ({ Given, When, Then }) => {
    let setup: Setup;
    let votedMatchupId: string;

    Given('a voter who has voted on matchup M', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 3);
      const next = await getNextMatchup(harness, setup.war.id, setup.voterId);
      votedMatchupId = next.body.matchup.id;
      await postVote(harness, setup.war.id, votedMatchupId, setup.voterId, next.body.matchup.left.id);
    });

    When('they request /matchups/next repeatedly until 204', async () => {
      // Drains the remaining matchups below; assertion happens in Then.
    });

    Then('matchup M is never returned', async () => {
      const seen: string[] = [];
      for (;;) {
        const next = await getNextMatchup(harness, setup.war.id, setup.voterId);
        if (next.status === 204) break;
        seen.push(next.body.matchup.id);
        await postVote(harness, setup.war.id, next.body.matchup.id, setup.voterId, next.body.matchup.left.id);
      }
      expect(seen).not.toContain(votedMatchupId);
    });
  });

  Scenario('Every pair is served before completion', ({ Given, When, Then }) => {
    let setup: Setup;
    const voted = new Set<string>();

    Given('an active War with 4 contestants and therefore 6 pairs', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 4);
    });

    When('a voter requests and votes until /matchups/next returns 204', async () => {
      for (;;) {
        const next = await getNextMatchup(harness, setup.war.id, setup.voterId);
        if (next.status === 204) break;
        voted.add(next.body.matchup.id);
        await postVote(harness, setup.war.id, next.body.matchup.id, setup.voterId, next.body.matchup.left.id);
      }
    });

    Then('they have voted on all 6 pairs exactly once', async () => {
      expect(voted.size).toBe(6);
      const rows = await harness.db.selectFrom('votes').selectAll().where('voter_id', '=', setup.voterId).execute();
      expect(rows).toHaveLength(6);
    });
  });

  Scenario('Pair order is randomised but stable per voter', ({ Given, Then, And }) => {
    let setup: Setup;
    let voterBId: string;

    Given('two voters in the same active War', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 5);
      const voterB = await makeVoter(harness.db, 'voter-b');
      voterBId = voterB.id;
      await joinWarAsVoter(harness.db, setup.war.id, voterBId);
    });

    Then('the order pairs are served in differs between them', async () => {
      const matchups = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', setup.war.id).execute();
      // All appearance_counts are still zero, so ordering is purely the
      // stable per-voter hash tie-break (spec §8.4) — compute it directly
      // with the same function production code uses, independently of the
      // HTTP layer, to get a non-flaky comparison of the two voters' orders.
      const orderFor = (voterId: string) =>
        [...matchups].sort((a, b) => stableHash(a.id, voterId).localeCompare(stableHash(b.id, voterId))).map((m) => m.id);

      const orderForA = orderFor(setup.voterId);
      const orderForB = orderFor(voterBId);
      expect(orderForA).not.toEqual(orderForB);

      const firstForA = await getNextMatchup(harness, setup.war.id, setup.voterId);
      expect(firstForA.body.matchup.id).toBe(orderForA[0]);
    });

    And("each voter's own order is identical across repeated requests", async () => {
      const first = await getNextMatchup(harness, setup.war.id, setup.voterId);
      const second = await getNextMatchup(harness, setup.war.id, setup.voterId);
      expect(second.body.matchup.id).toBe(first.body.matchup.id);
      expect(second.body.matchup.left.id).toBe(first.body.matchup.left.id);
    });
  });

  Scenario('Pair selection favours the least-shown contestants', ({ Given, And, When, Then }) => {
    let setup: Setup;
    let contestantC: string;

    Given('an active War where contestant C has the lowest appearance_count', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 4);
      const [a, b, c, d] = setup.contestants;
      contestantC = c!.id;
      for (const contestant of [a, b, d]) {
        await harness.db.updateTable('contestants').set({ appearance_count: 10 }).where('id', '=', contestant!.id).execute();
      }
    });

    When('a voter requests /matchups/next', () => {
      // The assertion below performs the request.
    });

    And('they have unvoted pairs both containing and not containing C', () => {
      // True by construction: with 4 contestants none have been voted on yet.
    });

    Then('the returned pair contains C', async () => {
      const next = await getNextMatchup(harness, setup.war.id, setup.voterId);
      expect([next.body.matchup.left.id, next.body.matchup.right.id]).toContain(contestantC);
    });
  });

  Scenario('The displayed side is decided by the API and recorded', ({ Given, Then, When, And }) => {
    let setup: Setup;
    let matchupId: string;
    let leftId: string;

    Given('a voter served matchup M', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 2);
      const next = await getNextMatchup(harness, setup.war.id, setup.voterId);
      matchupId = next.body.matchup.id;
      leftId = next.body.matchup.left.id;
    });

    Then('the response names which contestant is left and which is right', () => {
      expect(leftId).toBeTruthy();
    });

    And('the order is identical if the request is repeated', async () => {
      const again = await getNextMatchup(harness, setup.war.id, setup.voterId);
      expect(again.body.matchup.left.id).toBe(leftId);
    });

    When('they vote', async () => {
      await postVote(harness, setup.war.id, matchupId, setup.voterId, leftId);
    });

    Then('presented_left_id is stored on the Vote record', async () => {
      const vote = await harness.db
        .selectFrom('votes')
        .selectAll()
        .where('matchup_id', '=', matchupId)
        .where('voter_id', '=', setup.voterId)
        .executeTakeFirstOrThrow();
      expect(vote.presented_left_id).toBe(leftId);
    });
  });

  Scenario("The next matchup's media is offered for prefetch", ({ Given, When, Then }) => {
    let setup: Setup;
    let response: request.Response;

    Given('a voter with at least two pairs remaining', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 3);
    });

    When('they request /matchups/next', async () => {
      response = await getNextMatchup(harness, setup.war.id, setup.voterId);
    });

    Then("the response includes a prefetch block naming the following matchup's media", () => {
      expect(response.body.prefetch).toBeDefined();
      expect(response.body.prefetch.matchup_id).not.toBe(response.body.matchup.id);
      expect(Array.isArray(response.body.prefetch.media)).toBe(true);
      expect(response.body.prefetch.media.length).toBeGreaterThan(0);
    });
  });

  Scenario('Abandoning produces no record', ({ Given, When, Then, And }) => {
    let setup: Setup;
    let matchupId: string;

    Given('a voter served matchup M who never votes on it', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 2);
      const next = await getNextMatchup(harness, setup.war.id, setup.voterId);
      matchupId = next.body.matchup.id;
    });

    When('they leave the War', () => {
      // No API models "leaving" (spec §10.2: abandoning is simply not voting
      // — there is no skip/leave action). Nothing to do here.
    });

    Then('no Vote record exists for matchup M', async () => {
      const rows = await harness.db.selectFrom('votes').selectAll().where('matchup_id', '=', matchupId).execute();
      expect(rows).toHaveLength(0);
    });

    And("neither contestant's counters changed", async () => {
      const rows = await harness.db.selectFrom('contestants').selectAll().where('war_id', '=', setup.war.id).execute();
      for (const row of rows) {
        expect(row.appearance_count).toBe(0);
        expect(row.win_count).toBe(0);
      }
    });
  });

  Scenario('Cannot vote on a closed War', ({ Given, When, Then }) => {
    let setup: Setup;
    let matchupId: string;
    let response: request.Response;

    Given('a War in "closed" status', async () => {
      setup = await setupActiveWarWithJoinedVoter(harness, 2);
      const matchup = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', setup.war.id).executeTakeFirstOrThrow();
      matchupId = matchup.id;
      await harness.app.ready();
      const jwt = await harness.jwtFor(setup.war.creatorId!);
      await request(harness.app.server).post(`/api/v1/wars/${setup.war.id}/close`).set('Authorization', `Bearer ${jwt}`).send();
    });

    When('a voter POSTs a vote', async () => {
      const matchup = await harness.db.selectFrom('matchups').selectAll().where('id', '=', matchupId).executeTakeFirstOrThrow();
      response = await postVote(harness, setup.war.id, matchupId, setup.voterId, matchup.contestant_a_id);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('Non-joined voter cannot vote', ({ Given, And, When, Then }) => {
    let war: War;
    let contestants: Contestant[];
    let voterId: string;
    let response: request.Response;

    Given('an active War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const built = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      war = await activateWarForTest(harness.db, built.war);
      contestants = built.contestants;
    });

    And('an authenticated voter who has not joined', async () => {
      const voter = await makeVoter(harness.db, 'non-joiner');
      voterId = voter.id;
    });

    When('they POST a vote', async () => {
      const matchup = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', war.id).executeTakeFirstOrThrow();
      response = await postVote(harness, war.id, matchup.id, voterId, contestants[0]!.id);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });
});
