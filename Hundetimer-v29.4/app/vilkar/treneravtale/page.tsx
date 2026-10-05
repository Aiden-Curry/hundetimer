import type { Metadata } from 'next';
import Link from 'next/link';
import { TRAINER_AGREEMENT_EFFECTIVE_LABEL, TRAINER_AGREEMENT_VERSION, trainerAgreementOperator, trainerAgreementSections } from '@/lib/legal/trainer-agreement';

export const metadata: Metadata = { title: 'Treneravtale', description: 'Gjeldende treneravtale for hundetrenere på Hundetimer.' };

export default function TrainerAgreementPage() {
  const operator = trainerAgreementOperator();
  const sections = trainerAgreementSections();
  return <main className="page-shell legal-page">
    <section className="legal-heading"><Link className="back-link" href="/bli-trener">← For trenere</Link><span className="eyebrow">Vilkår</span><h1>Treneravtale</h1><p className="lead muted">Versjon {TRAINER_AGREEMENT_VERSION}, gjelder fra {TRAINER_AGREEMENT_EFFECTIVE_LABEL}.</p><div className="legal-meta"><span><strong>Plattformoperatør</strong>{operator.legalName}{operator.organisationNumber ? `, org.nr. ${operator.organisationNumber}` : ''}</span><span><strong>Kontakt</strong>{operator.supportEmail}</span></div><div className="legal-actions"><a className="btn secondary" href="/trainer-agreement/current">Last ned avtalen som PDF</a><Link className="btn" href="/register?role=trainer">Opprett trenerkonto</Link></div></section>
    <div className="legal-layout"><aside className="legal-toc"><strong>Innhold</strong>{sections.map((section,index)=><a href={`#del-${index+1}`} key={section.title}>{section.title}</a>)}</aside><article className="legal-document"><div className="notice"><strong>Elektronisk avtale</strong><p>Når du godtar avtalen i trenerverifiseringen, registrerer Hundetimer avtaleversjon og tidspunkt og gjør en kopi tilgjengelig for nedlasting.</p></div>{sections.map((section,index)=><section id={`del-${index+1}`} className="legal-section" key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph,i)=><p key={i}>{paragraph}</p>)}</section>)}</article></div>
  </main>;
}
