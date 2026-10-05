const fs=require('fs');let p='app/saved/page.tsx';let s=fs.readFileSync(p,'utf8');s=s.replace('  return <main',`  const available = new Set([
    ...(trainers || []).map(t => 'trainer:' + t.id), ...(services || []).map(s => 'service:' + s.id),
    ...(activities || []).map(a => 'activity:' + a.id), ...(courses || []).map(c => 'online_course:' + c.id),
  ]);
  const unavailable = rows.filter(row => !available.has(row.item_type + ':' + row.item_id));
  return <main`);s=s.replace('<h1>Ting du vil finne igjen</h1>','<h1>Lagret</h1>');s=s.replace('  </main>;',`    {unavailable.length > 0 && <section className="dashboard-section"><div className="section-title"><h2>Ikke tilgjengelig akkurat nå</h2></div><p className="muted">Disse tilbudene er ikke lenger synlige. Du kan beholde dem eller fjerne dem fra listen.</p><div className="saved-unavailable">{unavailable.map(row => <div key={row.id}><span>{row.item_type === 'trainer' ? 'Hundetrener' : row.item_type === 'service' ? 'Privattime' : row.item_type === 'activity' ? 'Kurs eller arrangement' : 'Nettkurs'}</span><SaveButton itemType={row.item_type} itemId={row.item_id} saved canSave returnPath="/saved" /></div>)}</div></section>}
  </main>;`);fs.writeFileSync(p,s);
p='app/notifications/page.tsx';s=fs.readFileSync(p,'utf8');s=s.replace(".order('created_at', { ascending: false }).limit(100)",".eq('user_id', user.id).order('created_at', { ascending: false }).limit(100)");s=s.replace(".select('id', { count: 'exact', head: true }).is", ".select('id', { count: 'exact', head: true }).eq('user_id', user.id).is");fs.writeFileSync(p,s);
