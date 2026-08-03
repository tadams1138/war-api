import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeDraftWar, makeDraftWarWithContestants } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/contestant-schema.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('A pageant and a primary use different fields with the same code', ({ Given, And, When, Then }) => {
    let pageantWarId: string;
    let pageantCreatorId: string;
    let primaryWarId: string;
    let primaryCreatorId: string;

    Given('a War declaring country, age, and height', async () => {
      const creator = await makeVoter(harness.db, 'pageant-creator');
      pageantCreatorId = creator.id;
      const war = await makeDraftWar(harness.db, creator.id, {
        contestantSchema: [
          { key: 'country', label: 'Country', type: 'string' },
          { key: 'age', label: 'Age', type: 'number' },
          { key: 'height', label: 'Height', type: 'string' },
        ],
      });
      pageantWarId = war.id;
    });

    And('another War declaring party, state, and office', async () => {
      const creator = await makeVoter(harness.db, 'primary-creator');
      primaryCreatorId = creator.id;
      const war = await makeDraftWar(harness.db, creator.id, {
        contestantSchema: [
          { key: 'party', label: 'Party', type: 'string' },
          { key: 'state', label: 'State', type: 'string' },
          { key: 'office', label: 'Office', type: 'string' },
        ],
      });
      primaryWarId = war.id;
    });

    let pageantContestant: request.Response;
    let primaryContestant: request.Response;

    When('contestants are fetched from each', async () => {
      await harness.app.ready();
      const pageantJwt = await harness.jwtFor(pageantCreatorId);
      pageantContestant = await request(harness.app.server)
        .post(`/api/v1/wars/${pageantWarId}/contestants`)
        .set('Authorization', `Bearer ${pageantJwt}`)
        .send({ name: 'Maria', attributes: { country: 'Brazil', age: 24, height: '175cm' } });

      const primaryJwt = await harness.jwtFor(primaryCreatorId);
      primaryContestant = await request(harness.app.server)
        .post(`/api/v1/wars/${primaryWarId}/contestants`)
        .set('Authorization', `Bearer ${primaryJwt}`)
        .send({ name: 'Alex', attributes: { party: 'Independent', state: 'OH', office: 'Senate' } });
    });

    Then('each returns its own fields resolved with labels and values', () => {
      expect(pageantContestant.status).toBe(201);
      expect(pageantContestant.body.attributes).toEqual([
        { key: 'country', label: 'Country', type: 'string', value: 'Brazil' },
        { key: 'age', label: 'Age', type: 'number', value: 24 },
        { key: 'height', label: 'Height', type: 'string', value: '175cm' },
      ]);

      expect(primaryContestant.status).toBe(201);
      expect(primaryContestant.body.attributes).toEqual([
        { key: 'party', label: 'Party', type: 'string', value: 'Independent' },
        { key: 'state', label: 'State', type: 'string', value: 'OH' },
        { key: 'office', label: 'Office', type: 'string', value: 'Senate' },
      ]);
    });
  });

  Scenario('An attribute outside the schema is rejected', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War whose schema declares only country', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creator.id, {
        contestantSchema: [{ key: 'country', label: 'Country', type: 'string' }],
      });
      warId = war.id;
    });

    When('a contestant is created with an attribute keyed party', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Someone', attributes: { party: 'Independent' } });
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });
  });

  Scenario('A mistyped attribute is rejected', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a schema declaring age as a number', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creator.id, {
        contestantSchema: [{ key: 'age', label: 'Age', type: 'number' }],
      });
      warId = war.id;
    });

    When('a contestant is created with age set to "twenty-four"', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Someone', attributes: { age: 'twenty-four' } });
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });
  });

  Scenario('A dangerous URL never reaches storage', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a schema declaring a field of type url', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creator.id, {
        contestantSchema: [{ key: 'website', label: 'Website', type: 'url' }],
      });
      warId = war.id;
    });

    When('a contestant is created with a javascript: value for it', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Someone', attributes: { website: 'javascript:alert(1)' } });
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('no contestant record is created', async () => {
      const rows = await harness.db.selectFrom('contestants').selectAll().where('war_id', '=', warId).execute();
      expect(rows).toHaveLength(0);
    });
  });

  Scenario('Omitted fields are permitted', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a schema declaring country, age, and height', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creator.id, {
        contestantSchema: [
          { key: 'country', label: 'Country', type: 'string' },
          { key: 'age', label: 'Age', type: 'number' },
          { key: 'height', label: 'Height', type: 'string' },
        ],
      });
      warId = war.id;
    });

    When('a contestant is created supplying only country', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Someone', attributes: { country: 'Brazil' } });
    });

    Then('the contestant is created', () => {
      expect(response.status).toBe(201);
    });

    And('only country is present in its resolved attributes', () => {
      expect(response.body.attributes).toEqual([{ key: 'country', label: 'Country', type: 'string', value: 'Brazil' }]);
    });
  });

  Scenario('Attributes resolve in schema order', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a schema declaring country then age', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creator.id, {
        contestantSchema: [
          { key: 'country', label: 'Country', type: 'string' },
          { key: 'age', label: 'Age', type: 'number' },
        ],
      });
      warId = war.id;
    });

    When('a contestant supplies them in the opposite order', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Someone', attributes: { age: 30, country: 'Peru' } });
    });

    Then('the resolved attributes list country before age', () => {
      expect(response.body.attributes.map((a: { key: string }) => a.key)).toEqual(['country', 'age']);
    });
  });

  Scenario('The schema is fixed once a War is active', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('an active War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2, {
        contestantSchema: [{ key: 'country', label: 'Country', type: 'string' }],
      });
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server).post(`/api/v1/wars/${war.id}/activate`).set('Authorization', `Bearer ${jwt}`).send();
      warId = war.id;
    });

    When('its contestant_schema is modified', async () => {
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .patch(`/api/v1/wars/${warId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ contestant_schema: [{ key: 'country', label: 'Country', type: 'string' }, { key: 'age', label: 'Age', type: 'number' }] });
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });
});
