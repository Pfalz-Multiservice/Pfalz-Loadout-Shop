import type { Metadata } from 'next';
import { WiderrufForm } from './WiderrufForm';

export const metadata: Metadata = {
  title: 'Vertrag widerrufen – PFALZ LOADOUT',
  alternates: { canonical: '/vertrag-widerrufen' },
};

/** Widerrufsfunktion nach § 356a BGB: Erklärung abgeben (Stufe 1), dann bestätigen (Stufe 2). */
export default function VertragWiderrufen() {
  return (
    <article className="wrap legal">
      <h1 className="display">Vertrag widerrufen</h1>
      <p>
        Hier kannst du deinen Kaufvertrag innerhalb der Widerrufsfrist online widerrufen. Gib deinen Namen, deine Bestellung und deine
        E-Mail-Adresse an. Im nächsten Schritt bestätigst du den Widerruf. Danach schicken wir dir sofort eine Eingangsbestätigung mit
        Datum und Uhrzeit per E-Mail.
      </p>
      <p>
        Alle Details findest du in der <a href="/widerruf">Widerrufsbelehrung</a>. Du kannst auch weiterhin per E-Mail oder Brief widerrufen.
      </p>
      <WiderrufForm />
    </article>
  );
}
