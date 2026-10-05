const fs=require('fs');function edit(p,fn){fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('app/trainer-dashboard/page.tsx',s=>s.replace("import { stripePayoutReady }", "import { osloLocalInputToIso } from '@/lib/oslo-time';\nimport { stripePayoutReady }")
.replace('  const nowIso = now.toISOString();','  const nowIso = now.toISOString();\n  const todayKey = osloDateKey(now);\n  const dayStart = osloLocalInputToIso(`${todayKey}T00:00`);')
.replace(".gte('ends_at', nowIso)",".gte('ends_at', dayStart)")
.replace("booking.status === 'confirmed' && new Date(booking.requested_starts_at) >= now","['confirmed', 'completed'].includes(booking.status) && (new Date(booking.requested_starts_at) >= now || osloDateKey(booking.requested_starts_at) === todayKey)")
.replace('  const todayKey = osloDateKey(now);\n  const appointments', '  const appointments')
.replace("const agenda = todayBookings.length ? todayBookings : appointments.slice(0, 5);","const agenda = todayBookings.length ? todayBookings : appointments.filter(a => new Date(a.startsAt) >= now).slice(0, 5);")
.replace('<span className="eyebrow">Supabase mangler</span><h1>Koble til databasen</h1><p className="muted">Legg inn Supabase-verdiene i <code>.env.local</code> og kjør SQL-filene.</p>', '<h1>Oversikten er midlertidig utilgjengelig</h1><p className="muted">Prøv igjen litt senere, eller kontakt Hundetimer.</p>'));
edit('app/trainer-dashboard/calendar/page.tsx',s=>s.replace('Google OAuth-nøkler mangler i <code>.env.local</code>.','Google Kalender er ikke tilgjengelig ennå. Du kan fortsatt administrere avtalene dine her.'));
edit('components/online-course-editor.tsx',s=>s.replace('500 MB i denne MVP-en.','500 MB.'));
