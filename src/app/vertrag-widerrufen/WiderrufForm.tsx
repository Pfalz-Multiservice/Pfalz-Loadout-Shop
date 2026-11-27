'use client';

import { useRef, useState } from 'react';

type Daten = { name: string; email: string; bestellung: string; artikel: string; website: string };

export function WiderrufForm() {
  const [stufe, setStufe] = useState<'eingabe' | 'bestaetigen' | 'fertig'>('eingabe');
  const [daten, setDaten] = useState<Daten | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [zeit, setZeit] = useState('');
  const kopf = useRef<HTMLHeadingElement>(null);

  function weiter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const d: Daten = {
      name: String(fd.get('name') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      bestellung: String(fd.get('bestellung') ?? '').trim(),
      artikel: String(fd.get('artikel') ?? '').trim(),
      website: String(fd.get('website') ?? ''),
    };
    setFehler('');
    setDaten(d);
    setStufe('bestaetigen');
    requestAnimationFrame(() => kopf.current?.focus());
  }

  async function bestaetigen() {
    if (!daten) return;
    setBusy(true);
    setFehler('');
    try {
      const r = await fetch('/api/widerruf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(daten),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      setZeit(j.zeit ?? '');
      setStufe('fertig');
      requestAnimationFrame(() => kopf.current?.focus());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Das hat nicht geklappt. Bitte widerrufe per E-Mail.');
    } finally {
      setBusy(false);
    }
  }

  if (stufe === 'fertig') {
    return (
      <div className="box" role="status">
        <h2 ref={kopf} tabIndex={-1}>
          Widerruf eingegangen
        </h2>
        <p>
          Dein Widerruf ist bei uns eingegangen{zeit ? ` (${zeit})` : ''}. Die Eingangsbestätigung mit Datum und Uhrzeit haben wir an{' '}
          <strong>{daten?.email}</strong> geschickt. Bitte prüfe auch deinen Spam-Ordner.
        </p>
      </div>
    );
  }

  if (stufe === 'bestaetigen' && daten) {
    return (
      <div className="box">
        <h2 ref={kopf} tabIndex={-1}>
          Bitte prüfen und bestätigen
        </h2>
        <dl className="widerruf-daten">
          <dt>Name</dt>
          <dd>{daten.name}</dd>
          <dt>E-Mail für die Bestätigung</dt>
          <dd>{daten.email}</dd>
          <dt>Bestellung</dt>
          <dd>{daten.bestellung}</dd>
          <dt>Widerrufene Artikel</dt>
          <dd>{daten.artikel || 'der gesamte Vertrag'}</dd>
        </dl>
        {fehler && (
          <p className="err" role="alert">
            {fehler}
          </p>
        )}
        <div className="widerruf-knoepfe">
          <button type="button" className="btn btn--signal tab" onClick={bestaetigen} disabled={busy}>
            {busy ? 'Einen Moment …' : 'Widerruf bestätigen'}
          </button>
          <button type="button" className="btn tab" onClick={() => setStufe('eingabe')} disabled={busy}>
            Angaben ändern
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="box widerruf-form" onSubmit={weiter}>
      <label htmlFor="w-name">Dein Name</label>
      <input id="w-name" className="input" name="name" required autoComplete="name" defaultValue={daten?.name} />

      <label htmlFor="w-bestellung">Bestellnummer oder Bestelldatum</label>
      <input id="w-bestellung" className="input" name="bestellung" required placeholder="z. B. PL-261127-AB12" defaultValue={daten?.bestellung} />

      <label htmlFor="w-artikel">Welche Artikel? (leer lassen = ganze Bestellung)</label>
      <input id="w-artikel" className="input" name="artikel" placeholder="z. B. Range Bag Oliv" defaultValue={daten?.artikel} />

      <label htmlFor="w-email">E-Mail für die Eingangsbestätigung</label>
      <input id="w-email" className="input" type="email" name="email" required autoComplete="email" defaultValue={daten?.email} />

      <div className="hp" aria-hidden="true">
        <input tabIndex={-1} name="website" autoComplete="off" />
      </div>

      <button type="submit" className="btn btn--signal tab">
        Weiter zur Bestätigung
      </button>
    </form>
  );
}
