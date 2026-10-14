const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// All auth, Storage, database, Stripe, calendar and email calls are local mocks.
const rows = {};
let userId = 'owner', uploaded = [], removed = [], sent = [], captures = 0, readyChecks = 0;
const objects = new Map(), providerKeys = new Set();
let failEmail = false;
function query(table) {
  let filters = [], operation = 'select', payload, single = false, required = false;
  const q = new Proxy({}, { get(_, method) {
    if (method === 'then') return resolve => {
      const all = rows[table] ||= [];
      const matches = row => filters.every(fn => fn(row));
      let result = all.filter(matches);
      if (operation === 'insert' || operation === 'upsert') {
        result = [];
        for (const item of Array.isArray(payload) ? payload : [payload]) {
          const duplicate = operation === 'upsert' && all.find(r => table === 'notifications' ? r.user_id === item.user_id && r.event_key === item.event_key : r.journal_id === item.journal_id);
          if (duplicate) continue;
          const saved = { id: 'row-' + all.length, ...item };
          all.push(saved); result.push(saved);
        }
      }
      if (operation === 'update') result.forEach(row => Object.assign(row, payload));
      if (operation === 'delete') rows[table] = all.filter(row => !matches(row));
      resolve({ data: single ? result[0] || null : result, error: required && !result.length ? Error('missing row') : null, count: result.length });
    };
    return (...args) => {
      if (['insert','upsert','update','delete'].includes(method)) { operation = method; payload = args[0]; }
      if (method === 'eq') filters.push(row => row[args[0]] === args[1]);
      if (method === 'in') filters.push(row => args[1].includes(row[args[0]]));
      if (method === 'is') filters.push(row => (row[args[0]] ?? null) === args[1]);
      if (method === 'single' || method === 'maybeSingle') single = true;
      if (method === 'single') required = true;
      return q;
    };
  }});
  return q;
}
const db = {
  from: query,
  auth: { getUser: async () => ({ data: { user: { id: userId } } }), admin: { getUserById: async id => ({ data: { user: { email: id + '@test.invalid' } } }) } },
  storage: { from: bucket => ({
    upload: async (key, file) => { assert.equal(bucket, 'dog-photos'); assert.ok(key.startsWith(userId + '/')); objects.set(key, file); uploaded.push(key); return { error: null }; },
    remove: async keys => { keys.forEach(key => { objects.delete(key); removed.push(key); }); return { error: null }; },
    createSignedUrl: async key => ({ data: objects.has(key) ? { signedUrl: 'https://storage.test/signed/' + key } : null }),
  }) },
  rpc: async (name, args) => {
    if (name === 'claim_private_booking_email') {
      const key = args.p_event_key;
      const receipt = (rows.private_booking_email_deliveries ||= []).find(r => r.event_key === key);
      if (receipt && (receipt.sent_at || receipt.locked_until !== new Date(0).toISOString())) return { data: false };
      if (!receipt) rows.private_booking_email_deliveries.push({ event_key: key });
      return { data: true };
    }
    if (name === 'system_confirm_booking') {
      const b = rows.bookings.find(b => b.id === args.p_booking_id);
      assert.equal(b.payment_status, 'captured'); assert.equal(b.status, 'pending'); b.status = 'confirmed';
    } else throw Error('Unexpected RPC: ' + name);
    return { data: null, error: null };
  },
};
const cache = {};
const overrides = {
  'server-only': {},
  '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/supabase/server': { createClient: async () => db },
  '@/lib/supabase/config': { isSupabaseConfigured: () => true },
  '@/lib/email/server': { sendTransactionalEmail: async options => {
    if (failEmail) throw Error('provider unavailable');
    if (!providerKeys.has(options.idempotencyKey)) { sent.push(options); providerKeys.add(options.idempotencyKey); }
    return { skipped: false, id: 'email' };
  } },
  '@/lib/calendar/server': { syncBookingToCalendar: async () => {}, deleteBookingCalendarEvent: async () => {} },
  '@/lib/promotions/server': { redeemPromotionForPurchase: async () => {}, releasePromotionForPurchase: async () => {} },
  '@/lib/stripe/payment-readiness': { requireTrainerPaymentReady: async () => { readyChecks++; } },
  '@/lib/stripe/server': { isStripeConfigured: () => false, getStripe: () => ({
    webhooks: { constructEvent: body => JSON.parse(body) },
    paymentIntents: { capture: async () => { captures++; return { status: 'succeeded' }; } },
  }) },
  '@/lib/stripe/group-sync': {}, '@/lib/stripe/online-course-sync': {},
  '@/lib/email/group-notifications': {}, '@/lib/email/waitlist-notifications': {},
  '@/components/customer-navigation': { CustomerNavigation: () => null },
  '@/components/submit-button': { SubmitButton: props => React.createElement('button', props) },
};
function load(file) {
  file = path.resolve(file);
  if (cache[file]) return cache[file].exports;
  const mod = { exports: {} }; cache[file] = mod;
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const req = id => {
    if (overrides[id]) return overrides[id];
    if (id.endsWith('.css')) return {};
    if (id === 'next/navigation') return { redirect: url => { throw Error('redirect ' + url); }, notFound: () => { throw Error('notFound'); } };
    if (id === 'next/cache') return { revalidatePath: () => {} };
    if (id === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (id.startsWith('@/') || id.startsWith('.')) {
      const target = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id);
      for (const ext of ['', '.ts', '.tsx']) if (fs.existsSync(target + ext) && fs.statSync(target + ext).isFile()) return load(target + ext);
    }
    return require(id);
  };
  new Function('require','module','exports', code)(req, mod, mod.exports);
  return mod.exports;
}
async function resolveTree(node) {
  if (Array.isArray(node)) return Promise.all(node.map(async (item, index) => {
    const resolved = await resolveTree(item);
    return React.isValidElement(resolved) ? React.cloneElement(resolved, { key: resolved.key || index }) : resolved;
  }));
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') return resolveTree(await node.type(node.props));
  return React.cloneElement(node, {}, await resolveTree(node.props.children));
}
async function html(file, id = 'booking') {
  return renderToStaticMarkup(await resolveTree(await load(file).default({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })));
}
const form = values => { const f = new FormData(); Object.entries(values).forEach(([k,v]) => f.set(k,v)); return f; };
const booking = () => rows.bookings[0];
async function main() {
  process.env.RESEND_API_KEY = 'mock'; process.env.STRIPE_WEBHOOK_SECRET = 'mock';
  rows.profiles = [{ id:'owner', role:'owner', display_name:'Kari' }, { id:'trainer', role:'trainer', display_name:'Trener' }];
  rows.trainer_profiles = [{ id:'trainer', business_name:'Hundetrening', verification_status:'approved' }];
  rows.services = [{ id:'service', trainer_id:'trainer', title:'Privattime', booking_mode:'instant', duration_minutes:60 }];
  rows.dogs = [{ id:'dog', owner_id:'owner', name:'Luna', sex:'female', photo_path:null }];
  rows.bookings = [{ id:'booking', trainer_id:'trainer', customer_id:'owner', dog_id:'dog', dog_name:'Luna', service_id:'service', status:'pending', payment_status:'authorized', stripe_payment_intent_id:'pi', requested_starts_at:'2027-01-15T12:00:00Z', subtotal_nok:900, service_fee_nok:29 }];
  const { parseDogWeight, validateDogPhoto } = load('lib/dogs.ts');
  assert.equal(parseDogWeight('18,5'),18.5); assert.equal(parseDogWeight('18.5'),18.5); assert.equal(parseDogWeight(''),null);
  for (const invalid of ['18,5.2','-1','251','NaN','1e2']) assert.throws(() => parseDogWeight(invalid));
  const dogActions = load('app/account/dogs/actions.ts');
  for (const value of ['18,5','18.5']) {
    await assert.rejects(dogActions.saveDogAction(form({id:'dog',name:'Luna',weightKg:value})),/message=Lagret/);
    assert.equal(rows.dogs[0].weight_kg,18.5); assert.equal(typeof rows.dogs[0].weight_kg,'number');
  }
  assert.match(await html('app/account/dogs/page.tsx'), /dog-avatar-placeholder/);
  assert.doesNotMatch(await html('app/account/dogs/page.tsx'), /Whimsy|Rough Collie|placeholder="18,5"/);
  const photo = new File([Buffer.from([137,80,78,71,13,10,26,10,0])], 'photo.png', { type:'image/png' });
  await assert.rejects(validateDogPhoto(new File(['<svg>'], 'x.png', {type:'image/png'})),/JPEG/);
  await assert.rejects(validateDogPhoto(new File([new Uint8Array(4194305)], 'large.png',{type:'image/png'})),/4 MB/);
  for (let i=0;i<2;i++) await assert.rejects(dogActions.saveDogAction(form({id:'dog',name:'Luna',photo})),/message=Lagret/);
  assert.equal(uploaded.length,2); assert.equal(removed.length,1); assert.equal(objects.size,1);
  assert.match(await html('app/account/dogs/page.tsx'), /https:\/\/storage.test\/signed/);
  await assert.rejects(dogActions.saveDogAction(form({id:'dog',name:'Luna',removePhoto:'on'})),/message=Lagret/);
  assert.equal(rows.dogs[0].photo_path,null); assert.equal(objects.size,0);
  await assert.rejects(dogActions.saveDogAction(form({name:'Ny hund',photo,weightKg:'18,5'})),/message=Lagret/);
  const createdDog=rows.dogs.find(d=>d.name==='Ny hund'); assert.ok(createdDog.photo_path); assert.equal(createdDog.weight_kg,18.5);
  await assert.rejects(dogActions.deleteDogAction(form({id:createdDog.id})),/message=/); assert.equal(objects.size,0);
  const uploadCount=uploaded.length;
  userId='stranger'; await assert.rejects(dogActions.saveDogAction(form({id:'dog',name:'Stolen',photo})),/error=/); assert.equal(uploaded.length,uploadCount); userId='owner';
  console.log('PASS weight comma/dot numeric storage; blank placeholders; photo fallback/upload/change/remove, format/size and owner checks');

  const webhook = load('app/api/stripe/webhook/route.ts').POST;
  const event = {type:'payment_intent.succeeded', data:{object:{id:'pi',status:'succeeded',metadata:{booking_id:'booking'}}}};
  const request = () => new Request('https://test.invalid/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':'mock'},body:JSON.stringify(event)});
  const response = await webhook(request());
  assert.equal(response.status,200,await response.text());
  assert.equal(booking().status,'confirmed'); assert.equal(readyChecks,1);
  assert.equal(rows.notifications.filter(n=>n.user_id==='trainer').length,1);
  const trainerEmail = sent.find(e=>e.to==='trainer@test.invalid'); assert.ok(trainerEmail);
  for (const detail of ['Privattime','Luna','Kari','2027','/booking/booking']) assert.ok(trainerEmail.html.includes(detail));
  await webhook(request()); await webhook(request());
  assert.equal(rows.notifications.filter(n=>n.user_id==='trainer').length,1); assert.equal(sent.filter(e=>e.to==='trainer@test.invalid').length,1);
  // Persistent receipt, even when the provider's own short-lived dedup cache expires.
  providerKeys.clear(); await webhook(request()); assert.equal(sent.filter(e=>e.to==='trainer@test.invalid').length,1);
  console.log('PASS paid webhook trainer notification/email, customer confirmation retained, repeated webhooks and durable deduplication');

  booking().status='cancelled_by_customer'; booking().cancelled_by='customer'; booking().cancellation_reason='Syk hund'; booking().payment_status='refunded'; booking().refund_status='succeeded'; booking().refund_amount_nok=929;
  const { notifyBookingCancelled } = load('lib/email/notifications.ts');
  await notifyBookingCancelled('booking','customer'); await notifyBookingCancelled('booking','customer');
  assert.equal(rows.notifications.filter(n=>n.event_key==='booking-cancelled/customer/other/booking').length,1);
  const cancellations=sent.filter(e=>e.to==='trainer@test.invalid'&&e.idempotencyKey.includes('cancelled'));
  assert.equal(cancellations.length,1); for(const detail of ['Syk hund','Kari','Luna','2027','/booking/booking']) assert.ok(cancellations[0].html.includes(detail));
  providerKeys.clear(); await notifyBookingCancelled('booking','customer'); assert.equal(sent.filter(e=>e.to==='trainer@test.invalid'&&e.idempotencyKey.includes('cancelled')).length,1);
  await webhook(request()); assert.equal(booking().payment_status,'refunded'); assert.equal(booking().status,'cancelled_by_customer'); assert.equal(captures,0);
  userId='trainer';
  const detail=await html('app/booking/[id]/page.tsx'); for(const value of ['Avbestilt','Syk hund','Kari','Luna','Legg til journalnotat','Refundert']) assert.ok(detail.includes(value),value);
  const dashboard=await html('app/trainer-dashboard/page.tsx'); assert.match(dashboard,/Avbestilte privattimer/); assert.match(dashboard,/Syk hund/); assert.match(dashboard,/href="\/booking\/booking"/); assert.doesNotMatch(dashboard,/Marker Luna som fullført/);
  assert.equal((rows.trainer_lesson_journals||[]).length,0);
  const journalPage=await html('app/trainer-dashboard/journal/booking/[id]/page.tsx'); assert.match(journalPage,/manuelt journalnotat/); assert.doesNotMatch(journalPage,/name="publishShared"/);
  const journals=load('app/trainer-dashboard/journal/actions.ts');
  await assert.rejects(journals.saveBookingJournalAction(form({bookingId:'booking',privateNotes:'Oppfølging etter avbestilling',publishShared:'on',sharedSummary:'Fake completion'})),/message=/);
  assert.equal(rows.trainer_lesson_journals.length,1); assert.equal((rows.lesson_shared_notes||[]).length,0); assert.equal(booking().status,'cancelled_by_customer'); assert.equal((rows.trainer_ledger||[]).length,0);
  userId='stranger'; await assert.rejects(journals.saveBookingJournalAction(form({bookingId:'booking',privateNotes:'Forbidden'})),/redirect/); assert.equal(rows.trainer_lesson_journals.length,1);
  rows.profiles.push({id:'other-trainer',role:'trainer'}); userId='other-trainer';
  await assert.rejects(journals.saveBookingJournalAction(form({bookingId:'booking',privateNotes:'Forbidden'})),/error=/);
  assert.equal(rows.trainer_lesson_journals[0].private_notes,'Oppfølging etter avbestilling');
  const payoutSql=fs.readFileSync('supabase/platform-payout-upgrade.sql','utf8'); assert.match(payoutSql,/v_booking.status <> 'confirmed'/); assert.match(payoutSql,/v_booking.payment_status <> 'captured'/);
  console.log('PASS cancellation email and single existing notification; trainer history/details/reason; manual journal authorization; no automatic journal/completion/earnings; delayed webhook preserves refund');

  const {sendPrivateBookingEmail}=load('lib/email/private-booking-delivery.ts');
  const options={to:'trainer@test.invalid',subject:'retry',html:'test',idempotencyKey:'retry-test'};
  failEmail=true; await assert.rejects(sendPrivateBookingEmail(options),/provider unavailable/); failEmail=false;
  // An old unsent receipt remains retryable after its lease expires.
  rows.private_booking_email_deliveries.find(r=>r.event_key==='retry-test').first_attempt_at='2020-01-01T00:00:00Z';
  await sendPrivateBookingEmail(options); await sendPrivateBookingEmail(options); assert.equal(sent.filter(e=>e.idempotencyKey==='retry-test').length,1);
  booking().cancelled_by='trainer'; booking().status='declined_by_trainer';
  await notifyBookingCancelled('booking','trainer'); await notifyBookingCancelled('booking','trainer');
  const trainerReceipt=sent.filter(e=>e.to==='trainer@test.invalid'&&e.idempotencyKey==='booking-cancelled/trainer/receipt/booking');
  assert.equal(trainerReceipt.length,1); for(const detail of ['Syk hund','Kari','Luna','/booking/booking']) assert.ok(trainerReceipt[0].html.includes(detail));
  const migration=fs.readFileSync('supabase/dog-photos-private-booking-upgrade.sql','utf8');
  assert.match(migration, /'dog-photos', 'dog-photos', false, 4194304/);
  assert.match(migration, /photo_path = storage.objects.name/);
  assert.match(migration, /revoke all on public.private_booking_email_deliveries from anon, authenticated/);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  for (const policy of ['read', 'insert', 'update', 'delete']) {
    assert.ok(migration.includes(`drop policy if exists dog_photos_${policy} on storage.objects;`));
  }
  assert.match(migration, /drop constraint if exists dogs_photo_owner_path_check/);
  assert.match(migration, /create table if not exists public.private_booking_email_deliveries/);
  assert.match(migration, /create or replace function public.claim_private_booking_email/);
  assert.match(migration, /where private_booking_email_deliveries.sent_at is null\s+and private_booking_email_deliveries.locked_until < now\(\);/);
  assert.doesNotMatch(migration, /first_attempt_at\s*>|interval '23 hours'/);
  assert.match(migration, /v_booking.status <> 'pending' or v_booking.cancelled_by is not null/);
  console.log('PASS email failure releases delivery lease and retry delivers once');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
