import { SHOP } from '@/data/shop';

/**
 * Pflichtangaben nach Art. 19 Produktsicherheitsverordnung (EU) 2023/988 (GPSR).
 * Ware wird in Asien gefertigt und ausschließlich unter der Marke PFALZ LOADOUT
 * verkauft → Pfalz Loadout gilt als Hersteller (Art. 3 Nr. 8 GPSR) und ist zugleich Importeur.
 * Da der Hersteller in der EU sitzt, ist keine zusätzliche verantwortliche Person nötig.
 */
export function GpsrInfo({ kennung, style }: { kennung: string; style?: React.CSSProperties }) {
  const c = SHOP.contact;
  return (
    <details className="specs__more gpsr" style={style}>
      <summary className="mono">Hersteller &amp; Produktsicherheit</summary>
      <dl className="specs" style={{ borderTop: 0, margin: 0 }}>
        <div className="specs__row">
          <dt>Hersteller</dt>
          <dd>
            {c.company}, Inh. {c.owner}
            <br />
            {c.street}, {c.zip} {c.city}, Deutschland
          </dd>
        </div>
        <div className="specs__row">
          <dt>Kontakt</dt>
          <dd>
            <a href={`mailto:${c.email}`}>{c.email}</a>
          </dd>
        </div>
        <div className="specs__row">
          <dt>Produktkennung</dt>
          <dd>{kennung}</dd>
        </div>
      </dl>
    </details>
  );
}
