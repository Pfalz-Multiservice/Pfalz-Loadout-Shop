/**
 * Mailversand über das eigene Postfach (SMTP, z. B. Strato).
 * Ohne SMTP-Zugangsdaten (lokal / Vorschau) werden Mails nur geloggt.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { SHOP } from '@/data/shop';

type Mail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; href: string; contentType?: string }[];
};

/**
 * Harmonisierte EU-Mitteilung zur gesetzlichen Gewährleistung (DVO (EU) 2025/1960)
 * als Anhang der Bestellbestätigung – offizielle Datei, wird von der eigenen Website geladen.
 */
export const gewaehrleistungAnhang = (site: string) => [
  {
    filename: 'Gesetzliche-Gewaehrleistung-EU.png',
    href: `${site}/media/recht/gewaehrleistung-eu-mitteilung-de.png`,
    contentType: 'image/png',
  },
];

/** Textbaustein für Bestellmails: Rechtstexte, Widerrufsfunktion, Gewährleistung */
export const rechtsHinweis = (site: string) =>
  `Widerrufsbelehrung und AGB: ${site}/widerruf · ${site}/agb\n` +
  `Vertrag online widerrufen: ${site}/vertrag-widerrufen\n` +
  `Im Anhang findest du die EU-Mitteilung zur gesetzlichen Gewährleistung (mindestens zwei Jahre).`;

let transport: Transporter | null = null;

function getTransport() {
  if (transport) return transport;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT ?? 465);
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transport;
}

export const mailConfigured = () => !!getTransport();

export async function sendMail(m: Mail) {
  const t = getTransport();
  const from = process.env.MAIL_FROM ?? `PFALZ LOADOUT <${SHOP.contact.email}>`;
  if (!t) {
    console.info(`[mail:nicht konfiguriert] an ${m.to} – ${m.subject}\n${m.text}`);
    return { logged: true };
  }
  await t.sendMail({ from, ...m });
  return { sent: true };
}

export const shopInbox = () => process.env.MAIL_SHOP_TO ?? SHOP.contact.email;

export function signature() {
  const c = SHOP.contact;
  return [
    '',
    '—',
    'PFALZ LOADOUT',
    `${c.company} · Inh. ${c.owner}`,
    `${c.street} · ${c.zip} ${c.city}`,
    `${c.email} · ${c.phone}`,
    SHOP.vatNote,
  ].join('\n');
}
