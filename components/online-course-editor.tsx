'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/dialog';
import { createClient } from '@/lib/supabase/client';

type Course = { id:string; trainer_id:string; slug:string; title:string; summary:string|null; description:string|null; cover_image_url:string|null; price_nok:number; tags:string[]|null; level:string; estimated_minutes:number; published:boolean; certificate_enabled:boolean; certificate_subtitle:string|null };
type Module = { id:string; course_id:string; title:string; position:number };
type Lesson = { id:string; course_id:string; module_id:string; title:string; summary:string|null; position:number; duration_minutes:number; is_preview:boolean };
type Content = { lesson_id:string; course_id:string; body_text:string|null; video_path:string|null; attachment_path:string|null; attachment_name:string|null };

function slugify(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');}
function safeName(value:string){return value.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'') || 'fil';}

export function OnlineCourseEditor({course:initialCourse,modules:initialModules,lessons:initialLessons,contents:initialContents}:{course:Course;modules:Module[];lessons:Lesson[];contents:Content[]}){
  const router=useRouter(); const supabase=useMemo(()=>createClient(),[]);
  const [course,setCourse]=useState(initialCourse); const [modules,setModules]=useState(initialModules); const [lessons,setLessons]=useState(initialLessons); const [contents,setContents]=useState(initialContents);
  const [busy,setBusy]=useState(''); const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'module'; item: Module } | { kind: 'lesson'; item: Lesson } | null>(null);
  const [moduleDraft, setModuleDraft] = useState<{ id: string | null; title: string } | null>(null);
  const [savedPublication, setSavedPublication] = useState({ published: initialCourse.published, slug: initialCourse.slug });
  const [coverFile,setCoverFile]=useState<File|null>(null);

  async function run(label:string,fn:()=>Promise<void>){if(busy)return;setBusy(label);setError('');setMessage('');try{await fn();setMessage('Lagret.');router.refresh();}catch(e){setError(e instanceof Error?e.message:'Noe gikk galt.');}finally{setBusy('');}}
  async function upload(bucket:string,file:File,path:string){const {error}=await supabase.storage.from(bucket).upload(path,file,{upsert:true,cacheControl:'3600'});if(error)throw error;return path;}

  async function saveCourse(e:FormEvent){e.preventDefault();await run('course',async()=>{
    let cover=course.cover_image_url;
    if(coverFile){if(coverFile.size>10*1024*1024)throw new Error('Forsidebildet kan maks være 10 MB.');const path=`${course.trainer_id}/${course.id}/cover-${Date.now()}.${coverFile.name.split('.').pop()||'jpg'}`;await upload('online-course-covers',coverFile,path);cover=supabase.storage.from('online-course-covers').getPublicUrl(path).data.publicUrl;}
    const nextSlug=slugify(course.slug||course.title); if(!nextSlug)throw new Error('Kurset må ha en gyldig nettadresse.'); if(course.published && lessons.length===0) throw new Error('Legg til minst én leksjon før du publiserer kurset.');
    const payload={title:course.title.trim(),slug:nextSlug,summary:course.summary?.trim()||null,description:course.description?.trim()||null,cover_image_url:cover,price_nok:Math.max(1,Number(course.price_nok)||1),tags:course.tags||[],level:course.level,estimated_minutes:Math.max(0,Number(course.estimated_minutes)||0),certificate_enabled:course.certificate_enabled,certificate_subtitle:course.certificate_subtitle?.trim()||null,published:course.published,published_at:course.published?new Date().toISOString():null,updated_at:new Date().toISOString()};
    const {error}=await supabase.from('online_courses').update(payload).eq('id',course.id).eq('trainer_id',course.trainer_id);if(error)throw error;setCourse({...course,...payload});setSavedPublication({published:payload.published,slug:payload.slug});setCoverFile(null);
  });}

  async function saveModule(event: FormEvent) {
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
  async function deleteModule(module:Module, confirmed = false){if(savedPublication.published){setError('Skjul kurset før du sletter en modul.');return;}if(!confirmed){setDeleteTarget({kind:'module',item:module});return;}await run(`module-${module.id}`,async()=>{const {error}=await supabase.from('online_course_modules').delete().eq('id',module.id);if(error)throw error;const lessonIds=lessons.filter(l=>l.module_id===module.id).map(l=>l.id);setModules(modules.filter(m=>m.id!==module.id));setLessons(lessons.filter(l=>l.module_id!==module.id));setContents(contents.filter(c=>!lessonIds.includes(c.lesson_id)));});}
  async function addLesson(module:Module){await run(`lesson-new-${module.id}`,async()=>{const position=(lessons.filter(l=>l.module_id===module.id).reduce((m,x)=>Math.max(m,x.position),0)||0)+10;const {data,error}=await supabase.from('online_course_lessons').insert({course_id:course.id,module_id:module.id,title:'Ny leksjon',position,duration_minutes:0,is_preview:false}).select('*').single();if(error)throw error;const lesson=data as Lesson;const {error:contentError}=await supabase.from('online_course_lesson_content').insert({lesson_id:lesson.id,course_id:course.id});if(contentError)throw contentError;setLessons([...lessons,lesson]);setContents([...contents,{lesson_id:lesson.id,course_id:course.id,body_text:null,video_path:null,attachment_path:null,attachment_name:null}]);});}
  async function saveLesson(lesson:Lesson,content:Content,video?:File|null,attachment?:File|null){await run(`lesson-${lesson.id}`,async()=>{
    let videoPath=content.video_path;let attachmentPath=content.attachment_path;let attachmentName=content.attachment_name;
    if(video){if(video.size>500*1024*1024)throw new Error('Videoen kan maks være 500 MB.');videoPath=await upload('online-course-content',video,`${course.trainer_id}/${course.id}/${lesson.id}/video-${Date.now()}-${safeName(video.name)}`);}
    if(attachment){if(attachment.size>50*1024*1024)throw new Error('Vedlegget kan maks være 50 MB.');attachmentPath=await upload('online-course-content',attachment,`${course.trainer_id}/${course.id}/${lesson.id}/file-${Date.now()}-${safeName(attachment.name)}`);attachmentName=attachment.name;}
    const {error:lerr}=await supabase.from('online_course_lessons').update({title:lesson.title.trim(),summary:lesson.summary?.trim()||null,duration_minutes:Math.max(0,Number(lesson.duration_minutes)||0),is_preview:lesson.is_preview,updated_at:new Date().toISOString()}).eq('id',lesson.id);if(lerr)throw lerr;
    const nextContent={...content,video_path:videoPath,attachment_path:attachmentPath,attachment_name:attachmentName,body_text:content.body_text?.trim()||null};
    const {error:cerr}=await supabase.from('online_course_lesson_content').upsert({lesson_id:lesson.id,course_id:course.id,body_text:nextContent.body_text,video_path:videoPath,attachment_path:attachmentPath,attachment_name:attachmentName,updated_at:new Date().toISOString()});if(cerr)throw cerr;
    setLessons(lessons.map(l=>l.id===lesson.id?lesson:l));setContents(contents.map(c=>c.lesson_id===lesson.id?nextContent:c));
  });}
  async function deleteLesson(lesson:Lesson, confirmed = false){if(savedPublication.published){setError('Skjul kurset før du sletter en leksjon.');return;}if(!confirmed){setDeleteTarget({kind:'lesson',item:lesson});return;}await run(`lesson-${lesson.id}`,async()=>{const {error}=await supabase.from('online_course_lessons').delete().eq('id',lesson.id);if(error)throw error;setLessons(lessons.filter(l=>l.id!==lesson.id));setContents(contents.filter(c=>c.lesson_id!==lesson.id));});}

  return <div className="course-builder">
    <Dialog open={Boolean(deleteTarget)} title={deleteTarget?.kind === 'module' ? 'Slette modulen?' : 'Slette leksjonen?'} busy={Boolean(busy)} onClose={() => setDeleteTarget(null)}>
      <p>«{deleteTarget?.item.title}» blir slettet.{deleteTarget?.kind === 'module' ? ' Alle leksjonene i modulen blir også slettet.' : ''} Dette kan ikke angres.</p>
      <div className="ui-dialog-actions"><button data-dialog-autofocus type="button" className="btn secondary" disabled={Boolean(busy)} onClick={() => setDeleteTarget(null)}>Behold</button><button type="button" className="btn danger" disabled={Boolean(busy)} onClick={async () => { if (!deleteTarget) return; if (deleteTarget.kind === 'module') await deleteModule(deleteTarget.item, true); else await deleteLesson(deleteTarget.item, true); setDeleteTarget(null); }}>{busy ? 'Sletter…' : 'Slett'}</button></div>
    </Dialog>
    <section className="page-heading course-builder-heading"><div><span className="eyebrow">Kursbygger</span><h1>{course.title}</h1><p className="muted">{modules.length} moduler · {lessons.length} leksjoner · {savedPublication.published ? 'Publisert' : 'Utkast'}</p></div><div className="course-builder-head-actions"><a className="btn secondary" target="_blank" rel="noreferrer" href={`/online-courses/${savedPublication.slug}`}>Forhåndsvis</a></div></section>
    {message?<p role="status" className="form-success">{message}</p>:null}{error?<p role="alert" className="form-error form-error-block">{error}</p>:null}
    <details className="workspace-disclosure" open={!modules.length}><summary>Kursinformasjon, pris og publisering</summary><form onSubmit={saveCourse} className="dashboard-section course-settings-card">
      <div className="section-title"><div><span className="eyebrow">Kursinformasjon</span><h2>Detaljer og salg</h2></div><label className="publish-toggle"><input type="checkbox" aria-describedby="course-publish-help" checked={course.published} onChange={e=>setCourse({...course,published:e.target.checked})}/><span>{course.published?'Publisert':'Utkast'}</span></label></div>
      <p id="course-publish-help" className="muted small">Endringer i publisering gjelder når du lagrer kursinformasjonen.</p>
      <div className="form-grid editor-form-grid">
        <label>Tittel<input value={course.title} onChange={e=>setCourse({...course,title:e.target.value})} required/></label>
        <label>Profiladresse<input value={course.slug} onChange={e=>setCourse({...course,slug:slugify(e.target.value)})} required/></label>
        <label>Pris i kr<input type="number" min="1" step="1" value={course.price_nok} onChange={e=>setCourse({...course,price_nok:Number(e.target.value)})}/></label>
        <label>Nivå<select value={course.level} onChange={e=>setCourse({...course,level:e.target.value})}><option value="all">Alle nivåer</option><option value="beginner">Nybegynner</option><option value="intermediate">Viderekommen</option><option value="advanced">Avansert</option></select></label>
        <label>Omtrentlig total tid, minutter<input type="number" min="0" value={course.estimated_minutes} onChange={e=>setCourse({...course,estimated_minutes:Number(e.target.value)})}/></label>
        <label>Emner, separert med komma<input value={(course.tags||[]).join(', ')} onChange={e=>setCourse({...course,tags:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})} placeholder="Båndtrening, passering, hverdag"/></label>
        <label className="full">Kort sammendrag<input value={course.summary||''} onChange={e=>setCourse({...course,summary:e.target.value})} placeholder="Hva vil deltakeren lære?"/></label>
        <label className="full">Beskrivelse<textarea rows={6} value={course.description||''} onChange={e=>setCourse({...course,description:e.target.value})} placeholder="Hva lærer kunden, hvem passer kurset for, og hva trenger de?"/></label>
        <label className="full">Forsidebilde<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/></label>
        <label className="checkbox-row full"><input type="checkbox" checked={course.certificate_enabled} onChange={e=>setCourse({...course,certificate_enabled:e.target.checked})}/><span>Gi automatisk kursbevis når alle leksjoner er fullført</span></label>
        {course.certificate_enabled?<label className="full">Tekst på kursbeviset, valgfritt<input value={course.certificate_subtitle||''} onChange={e=>setCourse({...course,certificate_subtitle:e.target.value})} placeholder="For eksempel: Har fullført vårt grunnkurs i belønningsbasert båndtrening"/></label>:null}
      </div>
      {course.cover_image_url?<img className="course-editor-cover" src={course.cover_image_url} alt=""/>:null}
      <button className="btn" disabled={Boolean(busy)} type="submit">{busy==='course'?'Lagrer...':'Lagre kursinformasjon'}</button>
    </form></details>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Innhold</span><h2>Moduler og leksjoner</h2></div><button type="button" className="btn secondary compact" disabled={Boolean(busy)} onClick={() => setModuleDraft({ id: null, title: '' })}>+ Ny modul</button></div>
      {moduleDraft ? <form className="course-module-form" onSubmit={saveModule}><label htmlFor="module-title">{moduleDraft.id ? 'Nytt modulnavn' : 'Navn på modul'}</label><input id="module-title" autoFocus required maxLength={180} value={moduleDraft.title} onChange={e=>setModuleDraft({...moduleDraft,title:e.target.value})} placeholder="For eksempel: Kom i gang"/><div className="editor-actions"><button className="btn compact" type="submit" disabled={Boolean(busy)}>{busy === 'module' ? 'Lagrer…' : moduleDraft.id ? 'Lagre navn' : 'Opprett modul'}</button><button className="btn secondary compact" type="button" disabled={Boolean(busy)} onClick={()=>setModuleDraft(null)}>Avbryt</button></div></form> : null}
      {modules.length?<div className="course-module-list">{[...modules].sort((a,b)=>a.position-b.position).map(module=><div className="course-module-editor" key={module.id}><div className="course-module-head"><div><span className="eyebrow">Modul</span><h3>{module.title}</h3></div><div><button className="text-button" type="button" disabled={Boolean(busy)} onClick={()=>setModuleDraft({id:module.id,title:module.title})}>Gi nytt navn</button><button className="text-button danger-text" type="button" disabled={Boolean(busy)} onClick={()=>deleteModule(module)}>Slett</button></div></div>
        <div className="course-lesson-editor-list">{lessons.filter(l=>l.module_id===module.id).sort((a,b)=>a.position-b.position).map(lesson=><LessonEditor key={lesson.id} lesson={lesson} content={contents.find(c=>c.lesson_id===lesson.id)||{lesson_id:lesson.id,course_id:course.id,body_text:null,video_path:null,attachment_path:null,attachment_name:null}} onChangeLesson={next=>setLessons(current=>current.map(l=>l.id===next.id?next:l))} onChangeContent={next=>setContents(current=>current.some(c=>c.lesson_id===next.lesson_id)?current.map(c=>c.lesson_id===next.lesson_id?next:c):[...current,next])} onSave={saveLesson} onDelete={deleteLesson} busy={Boolean(busy)}/>)}</div>
        <button type="button" className="btn secondary compact" disabled={Boolean(busy)} onClick={()=>addLesson(module)}>+ Legg til leksjon</button>
      </div>)}</div>:<div className="empty-state"><h3>Kurset trenger innhold</h3><p className="muted">Opprett en modul, og legg deretter til leksjoner med tekst, video og filer.</p><button className="btn" type="button" disabled={Boolean(busy)} onClick={() => setModuleDraft({ id: null, title: '' })}>Opprett første modul</button></div>}
    </section>
  </div>;
}

function LessonEditor({lesson,content,onChangeLesson,onChangeContent,onSave,onDelete,busy}:{lesson:Lesson;content:Content;onChangeLesson:(v:Lesson)=>void;onChangeContent:(v:Content)=>void;onSave:(l:Lesson,c:Content,v?:File|null,a?:File|null)=>Promise<void>;onDelete:(l:Lesson)=>Promise<void>;busy:boolean}){
  const [video,setVideo]=useState<File|null>(null);const [attachment,setAttachment]=useState<File|null>(null);const [open,setOpen]=useState(false);
  return <article className={`lesson-editor ${open?'open':''}`}><button type="button" className="lesson-editor-summary" aria-expanded={open} onClick={()=>setOpen(!open)}><span>▶</span><strong>{lesson.title}</strong><span className="muted small">{lesson.duration_minutes?`${lesson.duration_minutes} min`:''}{lesson.is_preview?' · Gratis forhåndsvisning':''}</span><span>{open?'▲':'▼'}</span></button>{open?<div className="lesson-editor-body"><div className="form-grid editor-form-grid"><label>Tittel<input value={lesson.title} onChange={e=>onChangeLesson({...lesson,title:e.target.value})}/></label><label>Varighet, minutter<input type="number" min="0" value={lesson.duration_minutes} onChange={e=>onChangeLesson({...lesson,duration_minutes:Number(e.target.value)})}/></label><label className="full">Kort beskrivelse<input value={lesson.summary||''} onChange={e=>onChangeLesson({...lesson,summary:e.target.value})}/></label><label className="full">Leksjonstekst<textarea rows={10} value={content.body_text||''} onChange={e=>onChangeContent({...content,body_text:e.target.value})} placeholder="Skriv leksjonen her. Avsnitt beholdes i kursvisningen."/></label><label>Video<input type="file" accept="video/mp4,video/webm" onChange={e=>setVideo(e.target.files?.[0]||null)}/><span className="muted tiny">{content.video_path?'Video er lastet opp. ':''}{video?video.name:''}</span></label><label>PDF eller bilde<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setAttachment(e.target.files?.[0]||null)}/><span className="muted tiny">{content.attachment_name||attachment?.name||''}</span></label><label className="checkbox-row"><input type="checkbox" checked={lesson.is_preview} onChange={e=>onChangeLesson({...lesson,is_preview:e.target.checked})}/><span>Gratis forhåndsvisning før kjøp</span></label></div><div className="lesson-editor-actions"><button type="button" className="btn compact" disabled={busy} onClick={()=>onSave(lesson,content,video,attachment)}>{busy?'Lagrer...':'Lagre leksjon'}</button><button type="button" disabled={busy} className="text-button danger-text" onClick={()=>onDelete(lesson)}>Slett leksjon</button></div></div>:null}</article>;
}

