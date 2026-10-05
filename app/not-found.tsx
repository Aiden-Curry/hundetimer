import Link from 'next/link';
import { ArrowRight, PawPrint } from 'lucide-react';
import './not-found.css';

export default function NotFound() {
  return (
    <main className="page-shell missing-page">
      <div className="missing-art" aria-hidden="true">
        <span className="missing-number">404</span>
        <svg className="missing-dog" viewBox="0 0 320 250" fill="none">
          <ellipse cx="162" cy="232" rx="108" ry="9" fill="#234033" opacity=".08" />
          <path d="M235 190C290 190 289 137 268 141C250 145 275 163 237 163" stroke="#b48a53" strokeWidth="22" strokeLinecap="round" />
          <path d="M130 138C160 119 228 134 243 164C254 186 242 218 221 221H130Z" fill="#d5b17c" />
          <path d="M205 190V226H229" stroke="#b48a53" strokeWidth="21" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M143 172L132 224H153" stroke="#d5b17c" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M101 68C74 63 64 90 69 123L85 143L105 108Z" fill="#8e6744" />
          <path d="M96 81C113 57 150 60 166 83C178 103 171 135 158 151C145 166 111 163 96 146C80 128 81 101 96 81Z" fill="#d5b17c" />
          <path d="M153 72C181 64 195 95 181 133C176 145 164 140 159 130L150 94Z" fill="#8e6744" />
          <ellipse cx="121" cy="133" rx="31" ry="23" fill="#f8ebd6" />
          <path d="M121 139V153C121 168 138 166 138 153V141" fill="#cf897d" />
          <path d="M112 123Q122 115 132 123Q131 135 122 137Q113 134 112 123Z" fill="#234033" />
          <circle cx="106" cy="107" r="4" fill="#234033" />
          <circle cx="145" cy="105" r="4" fill="#234033" />
          <path d="M102 150Q126 166 152 150" stroke="#234033" strokeWidth="10" strokeLinecap="round" />
          <circle cx="130" cy="164" r="8" fill="#d7a84b" />
          <path d="M53 222L107 200M73 214L67 202M90 207L102 212" stroke="#8e6744" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="missing-caption">Sporhunden vår fant en kvist i stedet.</span>
      </div>
      <div className="missing-copy">
        <span className="missing-label"><PawPrint size={16} aria-hidden="true" />404 · Siden finnes ikke</span>
        <h1>Denne siden har stukket av.</h1>
        <p>Vi ropte «kom!», men den hørte ikke etter. Siden kan ha blitt flyttet, eller lenken kan være feil.</p>
        <div className="missing-actions">
          <Link className="btn" href="/">Til forsiden<ArrowRight size={17} aria-hidden="true" /></Link>
          <Link className="btn secondary" href="/discover">Finn hundetrening</Link>
        </div>
        <p className="missing-footnote">Kanskje vi også trenger et kurs i innkalling.</p>
      </div>
    </main>
  );
}
