/**
 * Elektronische Widerrufsfunktion nach § 356a BGB (seit 19.06.2026).
 * Stufe 1: Formular auf /vertrag-widerrufen (Name, Bestellung, E-Mail).
 * Stufe 2: Klick auf „Widerruf bestätigen“ → dieser Endpunkt.
 * Danach: Eingangsbestätigung mit Inhalt, Datum und Uhrzeit an den Kunden
 * (dauerhafter Datenträger = E-Mail) und Kopie an das Shop-Postfach.
 */
import { NextResponse } from 'next/server';
import { sendMail, shopInbox, signature } from '@/lib/mail';
import { OrderError, rateLimit } from '@/lib/order';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, max);

export async function POST(req: Request) {
  try {
    rateLimit(req, 5);
    const b = (await req.json()) as Record<string, unknown>;
    if (b.website) return NextResponse.json({ ok: true }); // Honeypot
    const name = clean(b.name, 120);
    const email = clean(b.email, 160).toLowerCase();
    const bestellung = clean(b.bestellung, 60);
    const artikel = clean(b.artikel, 400);
    if (!name) throw new OrderError('Bitte gib deinen Namen an.');
    if (!bestellung) throw new OrderError('Bitte gib deine Bestellnummer oder das Bestelldatum an.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new OrderError('Bitte gib eine gültige E-Mail-Adresse an.');

    const zeit = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'long', timeStyle: 'medium' });
    const inhalt = [
      `Name: ${name}`,
      `E-Mail: ${email}`,
      `Bestellung: ${bestellung}`,
      `Widerrufene Artikel: ${artikel || 'der gesamte Vertrag'}`,
      `Eingegangen am: ${zeit} (Uhrzeit Deutschland)`,
    ].join('\n');

    await sendMail({
      to: email,
      subject: `Eingangsbestätigung deines Widerrufs – PFALZ LOADOUT (${bestellung})`,
      text:
        `Hallo ${name},\n\nwir haben deinen Widerruf erhalten. Hier der Inhalt deiner Erklärung:\n\n${inhalt}\n\n` +
        `Bitte schick die Ware innerhalb von 14 Tagen an die unten stehende Anschrift zurück. ` +
        `Die Rückzahlung erfolgt wie in unserer Widerrufsbelehrung beschrieben.\n${signature()}`,
    });
    await sendMail({
      to: shopInbox(),
      replyTo: email,
      subject: `WIDERRUF eingegangen: ${bestellung} – ${name}`,
      text: `Widerruf über die Widerrufsfunktion der Website.\n\n${inhalt}`,
    });
    return NextResponse.json({ ok: true, zeit });
  } catch (e) {
    const status = e instanceof OrderError ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof OrderError ? e.message : 'Das hat nicht geklappt. Bitte widerrufe per E-Mail.' },
      { status }
    );
  }
}
