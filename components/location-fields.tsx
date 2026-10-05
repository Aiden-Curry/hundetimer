'use client';

import { useState } from 'react';

export function LocationFields({
  initialLat,
  initialLng,
  latName = 'latitude',
  lngName = 'longitude',
  compact = false,
  formId,
}: {
  initialLat?: number | string | null;
  initialLng?: number | string | null;
  latName?: string;
  lngName?: string;
  compact?: boolean;
  formId?: string;
}) {
  const [lat, setLat] = useState(initialLat == null ? '' : String(initialLat));
  const [lng, setLng] = useState(initialLng == null ? '' : String(initialLng));
  const [status, setStatus] = useState(lat && lng ? 'Posisjon lagret' : '');

  function locate() {
    if (!navigator.geolocation) {
      setStatus('Nettleseren støtter ikke posisjon.');
      return;
    }
    setStatus('Henter posisjon…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(3));
        setLng(position.coords.longitude.toFixed(3));
        setStatus('Posisjon hentet');
      },
      () => setStatus('Kunne ikke hente posisjon.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className={compact ? 'location-capture compact-location-capture' : 'location-capture'}>
      <input type="hidden" name={latName} value={lat} form={formId} />
      <input type="hidden" name={lngName} value={lng} form={formId} />
      <button className="btn secondary compact" type="button" onClick={locate}>Bruk min posisjon</button>
      <span className="muted tiny" role="status">{status || 'Gjør avstandsfilter mulig'}</span>
    </div>
  );
}
