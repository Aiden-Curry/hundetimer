const assert = require('node:assert/strict');
const { load, overrides } = require('../.review/customer-fixtures.cjs');

let inserts = [], failTable = null, stage = 'ready';
const db = {
  auth: { getUser: async () => ({ data: { user: { id: 'trainer' } } }) },
  from(table) {
    let inserted = false;
    const q = new Proxy({}, { get(_, method) {
      if (method === 'then') return resolve => resolve({
        data: table === 'trainer_profiles' ? { id: 'trainer' } : inserted ? null : [],
        error: inserted && failTable === table ? { message: `Failed ${table}` } : null,
      });
      return (...args) => {
        if (method === 'insert') { inserted = true; inserts.push({ table, payload: args[0] }); }
        if (inserted && ['select', 'single', 'maybeSingle'].includes(method)) throw Error('INSERT must not request returned rows');
        return q;
      };
    }});
    return q;
  },
};
overrides['@/lib/supabase/server'] = { createClient: async () => db };
overrides['@/lib/trainer-journey-server'] = { getTrainerJourney: async () => ({ stage, accessError: false }) };
const { createGroupOfferingAction } = load('app/trainer-dashboard/groups/actions.ts');
function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ kind: 'course', title: 'Valpekurs', city: 'Oslo', priceNok: '1995', capacity: '8', startsAt: '2027-01-15T12:00', endsAt: '2027-01-15T13:00', ...extra })) data.set(key, value);
  return data;
}
(async () => {
  for (stage of ['ready', 'stripe']) {
    inserts = [];
    await assert.rejects(createGroupOfferingAction(form()), /message=Kurset/);
    assert.equal(inserts.length, 2);
    const offering = inserts[0].payload;
    assert.equal(inserts[0].table, 'group_offerings');
    assert.match(offering.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(offering.trainer_id, 'trainer');
    assert.equal(offering.price_nok, 1995); assert.equal(offering.capacity, 8);
    assert.equal(offering.active, stage === 'ready');
    assert.equal(inserts[1].table, 'group_sessions');
    assert.equal(inserts[1].payload.offering_id, offering.id);
  }
  stage = 'ready'; inserts = []; failTable = 'group_offerings';
  await assert.rejects(createGroupOfferingAction(form()), /error=Failed%20group_offerings/);
  assert.equal(inserts.length, 1);
  inserts = []; failTable = 'group_sessions';
  await assert.rejects(createGroupOfferingAction(form()), /error=Failed%20group_sessions/);
  assert.equal(inserts.length, 2);
  failTable = null; inserts = [];
  await assert.rejects(createGroupOfferingAction(form({ capacity: '0' })), /error=/);
  assert.equal(inserts.length, 0);
  stage = 'approval';
  await assert.rejects(createGroupOfferingAction(form()), /verification/);
  assert.equal(inserts.length, 0);
  console.log('PASS group creation: server UUID, no INSERT RETURNING, session linkage, trainer ownership, readiness/approval/capacity guards, offering/session error handling. All database/auth calls mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
