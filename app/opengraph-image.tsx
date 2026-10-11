import { ImageResponse } from 'next/og';

export const alt = 'Hundetimer – finn hundetrener, kurs og hundetrening';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', background: '#f7f4ec', color: '#214233', padding: '64px 80px' }}>
      <div style={{ display: 'flex', fontSize: 38, fontWeight: 700 }}>Hundetimer</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}><div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>Finn hundetrening nær deg.</div><div style={{ fontSize: 30, color: '#53724e' }}>Privattimer · Kurs og aktiviteter · Nettkurs</div></div>
      <div style={{ display: 'flex', fontSize: 25, borderTop: '2px solid #d7a84b', paddingTop: 24 }}>hundetimer.no</div>
    </div>, size,
  );
}
