const fs=require('fs');function edit(p,fn){fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('components/online-course-editor.tsx',s=>s.replace("  const [coverFile,setCoverFile]", "  const [moduleDraft, setModuleDraft] = useState<{ id: string | null; title: string } | null>(null);\n  const [savedPublication, setSavedPublication] = useState({ published: initialCourse.published, slug: initialCourse.slug });\n  const [coverFile,setCoverFile]")
.replace('async function run(label:string,fn:()=>Promise<void>){setBusy', 'async function run(label:string,fn:()=>Promise<void>){if(busy)return;setBusy')
.replace('setCourse({...course,...payload});setCoverFile(null);','setCourse({...course,...payload});setSavedPublication({published:payload.published,slug:payload.slug});setCoverFile(null);')
.replace(/  async function addModule\(\)\{.*\n  async function renameModule\(module:Module\)\{.*\n/,`  async function saveModule(event: FormEvent) {
    event.preventDefault();
    if (!moduleDraft?.title.trim()) return;
    const draft = moduleDraft;
    await run('module', async () => {
      const title = draft.title.trim();
      if (draft.id) {
        const { error } = await supabase.from('online_course_modules').update({ title }).eq('id', draft.id).eq('course_id', course.id);
        if (error) throw error;
        setModules(current => current.map(m => m.id === draft.id ? { ...m, title } : m));
      } else {
        const position = modules.reduce((max, m) => Math.max(max, m.position), 0) + 10;
        const { data, error } = await supabase.from('online_course_modules').insert({ course_id: course.id, title, position }).select('*').single();
        if (error) throw error;
        setModules(current => [...current, data as Module]);
      }
      setModuleDraft(null);
    });
  }
`)
.replaceAll('if(course.published){setError(', 'if(savedPublication.published){setError(')
.replace('Bygg hele kurset her. Publiser først når innholdet er klart.','{modules.length} moduler · {lessons.length} leksjoner · {savedPublication.published ? \'Publisert\' : \'Utkast\'}')
.replace('href={`/online-courses/${course.slug}`}', 'href={`/online-courses/${savedPublication.slug}`}')
.replace('{message?<p className="form-success">','{message?<p role="status" className="form-success">').replace('{error?<p className="form-error form-error-block">','{error?<p role="alert" className="form-error form-error-block">')
.replace('    <form onSubmit={saveCourse}', '    <details className="workspace-disclosure" open={!modules.length}><summary>Kursinformasjon, pris og publisering</summary><form onSubmit={saveCourse}')
.replace('    </form>\n\n    <section','    </form></details>\n\n    <section')
.replace('checked={course.published}', 'aria-describedby="course-publish-help" checked={course.published}')
.replace('      <div className="form-grid editor-form-grid">','      <p id="course-publish-help" className="muted small">Endringer i publisering gjelder når du lagrer kursinformasjonen.</p>\n      <div className="form-grid editor-form-grid">')
.replace('disabled={busy===\'course\'}','disabled={Boolean(busy)}')
.replaceAll('onClick={addModule}', 'disabled={Boolean(busy)} onClick={() => setModuleDraft({ id: null, title: \'\' })}')
.replace('onClick={()=>renameModule(module)}','disabled={Boolean(busy)} onClick={()=>setModuleDraft({id:module.id,title:module.title})}')
.replace('onClick={()=>deleteModule(module)}','disabled={Boolean(busy)} onClick={()=>deleteModule(module)}')
.replace('onClick={()=>addLesson(module)}','disabled={Boolean(busy)} onClick={()=>addLesson(module)}')
.replace('busy={busy===`lesson-${lesson.id}`}','busy={Boolean(busy)}')
.replace('      {modules.length?<div',`      {moduleDraft ? <form className="course-module-form" onSubmit={saveModule}><label htmlFor="module-title">{moduleDraft.id ? 'Nytt modulnavn' : 'Navn på modul'}</label><input id="module-title" autoFocus required maxLength={180} value={moduleDraft.title} onChange={e=>setModuleDraft({...moduleDraft,title:e.target.value})} placeholder="For eksempel: Kom i gang"/><div className="editor-actions"><button className="btn compact" type="submit" disabled={Boolean(busy)}>{busy === 'module' ? 'Lagrer…' : moduleDraft.id ? 'Lagre navn' : 'Opprett modul'}</button><button className="btn secondary compact" type="button" disabled={Boolean(busy)} onClick={()=>setModuleDraft(null)}>Avbryt</button></div></form> : null}
      {modules.length?<div`)
.replace('<button type="button" className="text-button danger-text" onClick={()=>onDelete(lesson)}','<button type="button" disabled={busy} className="text-button danger-text" onClick={()=>onDelete(lesson)}'));
edit('app/trainer-dashboard/journal/booking/[id]/page.tsx',s=>s.replace('<h2>Oppsummering og hjemmeoppgaver</h2><label>','<h2>Oppsummering og hjemmeoppgaver</h2><p className="muted">Med deling slått på får kunden varsel når du lagrer en ny eller endret kundeoppsummering. Private notater deles ikke.</p><label>'));
edit('components/trainer-profile-editor.tsx',s=>s.replace('<p className="form-success">{message}', '<p role="status" className="form-success">{message}').replace('<p className="form-error form-error-block">{error}', '<p role="alert" className="form-error form-error-block">{error}').replace('<h2>Gjør profilen gjenkjennelig</h2>','<h2>Profil- og forsidebilde</h2>'));
