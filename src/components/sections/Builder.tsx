'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COLORS,
  COLOR_NO,
  PRODUCTS,
  SHOP,
  colorName,
  computeTotals,
  formatEuro,
  type ColorKey,
  type Product,
  type Variant,
} from '@/data/shop';
import { Picture } from '../Picture';
import { useCart } from '../cart/CartProvider';
import { pull } from '../MotionProvider';
import { cardLook } from './Vitrine';

/** Menge je Variante (SKU) im Set */
type SetLines = Record<string, number>;

const colorsOf = (p: Product) =>
  [...new Set(p.variants.map((v) => v.color))].sort((a, b) => COLOR_NO[a].localeCompare(COLOR_NO[b]));
const firstColor = (p: Product) =>
  colorsOf(p).find((c) => p.variants.some((v) => v.color === c && v.stock !== 'ausverkauft')) ?? colorsOf(p)[0];
const findVariantOf = (p: Product, color: ColorKey, option: string) =>
  p.variants.find((v) => v.color === color && (v.option ?? '') === option) ?? p.variants.find((v) => v.color === color)!;

/** Schnellstart: sinnvolle Sets mit einem Klick (nur Vorschläge, alles änderbar) */
const PRESETS: { label: string; items: { code: string; qty: number }[] }[] = [
  { label: 'Stand-Set: Range Bag + IFAK', items: [{ code: 'PL_KWT', qty: 1 }, { code: 'PL_IFAK', qty: 1 }] },
  { label: '3× IFAK (−10 %)', items: [{ code: 'PL_IFAK', qty: 3 }] },
  { label: 'Alles einmal', items: PRODUCTS.map((p) => ({ code: p.code, qty: 1 })) },
];

/** Eine Produktkarte: Bild in der gewählten Farbe, Farbkreise, Ausführung, Menge */
function KitCard({
  product,
  index,
  lines,
  setQty,
}: {
  product: Product;
  index: number;
  lines: SetLines;
  setQty: (sku: string, qty: number) => void;
}) {
  const colors = colorsOf(product);
  const [color, setColor] = useState<ColorKey>(firstColor(product));
  const options = useMemo(
    () => [...new Set(product.variants.filter((v) => v.color === color).map((v) => v.option ?? ''))],
    [product, color],
  );
  const [option, setOption] = useState(options[0] ?? '');
  useEffect(() => {
    if (!options.includes(option)) setOption(options[0] ?? '');
  }, [options, option]);
  const variant = findVariantOf(product, color, option);
  const qty = lines[variant.sku] ?? 0;
  const inSet = product.variants.reduce((s, v) => s + (lines[v.sku] ?? 0), 0);
  const soldOut = variant.stock === 'ausverkauft';
  const view = cardLook(product, color);
  const base = Math.min(...product.variants.filter((v) => v.color === color).map((v) => v.priceCents));
  const volume = SHOP.volume.codes.includes(product.code);

  return (
    <li className={`kit${inSet ? ' is-in' : ''}`} style={{ ['--i' as string]: index }}>
      <div className="kit__top mono">
        <span>{product.code}</span>
        <span className={`kit__count${inSet ? ' is-on' : ''}`} aria-hidden={!inSet}>
          Im Set: {inSet}
        </span>
      </div>
      <div className="kit__shot" aria-hidden="true">
        {view && <Picture key={view.k} k={view.k} alt="" sizes="(max-width: 700px) 40vw, 18vw" />}
      </div>
      <div className="kit__body">
        <h3 className="kit__name display">{product.name}</h3>
        <div className="kit__price">{formatEuro(variant.priceCents)}</div>
        {/* Mengenrabatt gilt je Produkt (Farben mischbar) → Fortschritt direkt auf der Karte */}
        {volume && (
          <div className={`kit__deal${inSet >= SHOP.volume.minQty ? ' is-on' : ''}`}>
            <span className="kit__seg" aria-hidden="true">
              {Array.from({ length: SHOP.volume.minQty }, (_, i) => (
                <i key={i} className={inSet > i ? 'is-on' : ''} />
              ))}
            </span>
            <span className="mono">
              {inSet >= SHOP.volume.minQty
                ? `✓ −${SHOP.volume.percent} % aktiv`
                : inSet
                  ? `Noch ${SHOP.volume.minQty - inSet}× → −${SHOP.volume.percent} %`
                  : `ab ${SHOP.volume.minQty} Stück −${SHOP.volume.percent} %`}
            </span>
          </div>
        )}

        <div className="kit__swatches" role="radiogroup" aria-label={`Farbe ${product.name}`}>
          {colors.map((c) => {
            const out = product.variants.filter((v) => v.color === c).every((v) => v.stock === 'ausverkauft');
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`${colorName(c)}${out ? ' (ausverkauft)' : ''}`}
                title={colorName(c)}
                disabled={out}
                className="kit__swatch"
                style={{ ['--sw' as string]: COLORS[c].swatch }}
                onClick={() => setColor(c)}
              />
            );
          })}
          <span className="kit__color mono">{colorName(color)}</span>
        </div>

        {options.length > 1 && (
          <div className="kit__opts" role="radiogroup" aria-label={`Ausführung ${product.name}`}>
            {options.map((o) => {
              const v = findVariantOf(product, color, o);
              const extra = v.priceCents - base;
              return (
                <button key={o || 'std'} type="button" role="radio" aria-checked={option === o} className="kit__opt" onClick={() => setOption(o)}>
                  {o || 'Standard'}
                  {extra > 0 && <span className="mono"> +{formatEuro(extra)}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="kit__act">
          {qty === 0 ? (
            <button type="button" className="kit__add" disabled={soldOut} onClick={() => setQty(variant.sku, 1)}>
              {soldOut ? (
                'Ausverkauft'
              ) : (
                <>
                  <span aria-hidden="true">+</span> Ins Set
                </>
              )}
            </button>
          ) : (
            <div className="kit__step" role="group" aria-label={`Menge ${product.name} ${colorName(color)}`}>
              <button type="button" aria-label="Eins weniger" onClick={() => setQty(variant.sku, qty - 1)}>
                −
              </button>
              <output aria-live="polite">{qty}</output>
              <button type="button" aria-label="Eins mehr" disabled={qty >= 20} onClick={() => setQty(variant.sku, qty + 1)}>
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Set-Baukasten: links vier Karten (Farbe, Ausführung, Menge direkt auf der Karte),
 * rechts „Dein Set“ – läuft mit, zeigt Fortschritt bis Mengenrabatt und Gratisversand, Ersparnis in €.
 * Handy: Karten im 2er-Raster, „Dein Set“ als Leiste unten in der Sektion (aufklappbar).
 */
export function Builder() {
  const { add } = useCart();
  const [lines, setLines] = useState<SetLines>({});
  const [openSum, setOpenSum] = useState(false);
  const [done, setDone] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);

  const setQty = (sku: string, qty: number) =>
    setLines((l) => {
      const n = { ...l };
      if (qty <= 0) delete n[sku];
      else n[sku] = Math.min(20, qty);
      return n;
    });

  const cart = useMemo(() => Object.entries(lines).map(([sku, qty]) => ({ sku, qty })), [lines]);
  const totals = useMemo(() => computeTotals(cart), [cart]);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  // Fortschritt bis Mengenrabatt: das Produkt, dem am wenigsten fehlt
  const V = SHOP.volume;
  const progress = useMemo(() => {
    let best: { name: string; have: number } | null = null;
    for (const code of V.codes) {
      const own = totals.lines.filter((l) => l.code === code);
      const have = own.reduce((s, l) => s + l.qty, 0);
      if (!have) continue;
      if (!best || Math.min(have, V.minQty) > Math.min(best.have, V.minQty)) best = { name: own[0].name, have };
    }
    return best;
  }, [totals, V]);
  const afterDiscount = totals.subtotalCents - totals.discountCents;
  const shipPct = Math.min(100, (afterDiscount / SHOP.shipping.freeFromCents) * 100);

  // Handy: die allgemeine Warenkorb-Leiste ausblenden, solange der Baukasten zu sehen ist
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => document.body.classList.toggle('kit-in-view', e.isIntersecting), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => {
      io.disconnect();
      document.body.classList.remove('kit-in-view');
    };
  }, []);

  const applyPreset = (items: { code: string; qty: number }[]) => {
    const next: SetLines = {};
    for (const it of items) {
      const p = PRODUCTS.find((x) => x.code === it.code);
      if (!p) continue;
      const v = findVariantOf(p, firstColor(p), '');
      if (v.stock !== 'ausverkauft') next[v.sku] = it.qty;
    }
    setLines(next);
  };

  const ctaText = count === 0 ? 'Wähl dein erstes Teil' : `In den Warenkorb · ${count} ${count === 1 ? 'Teil' : 'Teile'}`;

  return (
    <section ref={root} className="builder scan" id="loadout" aria-labelledby="builder-h">
      <div className="scan__beam" data-hud="SEKTOR 05 // LOADOUT" />
      <div className="wrap">
        <div className="sec-head mono">
          <span className="sec-head__label" id="builder-h">
            Set-Baukasten
          </span>
          <span className="dim-3">{V.label} · Farben mischbar</span>
        </div>
        <h2 className="display h2 kitx__h">
          Stell dein Set
          <br />
          <span className="dim">zusammen.</span>
        </h2>

        <div className="kitx__presets" role="group" aria-label="Schnellstart">
          <span className="mono dim-3">Schnellstart</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="kitx__preset" onClick={() => applyPreset(p.items)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="kitx">
          <ul className="kitx__grid">
            {PRODUCTS.map((p, i) => (
              <KitCard key={p.code} product={p} index={i} lines={lines} setQty={setQty} />
            ))}
          </ul>

          <aside className={`kitsum${openSum ? ' is-open' : ''}${count ? ' has-items' : ''}`} aria-label="Dein Set">
            <div className="kitsum__head">
              <span className="kitsum__title display">Dein Set</span>
              <span className="mono dim-3">
                {count} {count === 1 ? 'Teil' : 'Teile'}
              </span>
              <button type="button" className="kitsum__toggle mono" aria-expanded={openSum} onClick={() => setOpenSum((o) => !o)}>
                {openSum ? 'Weniger' : 'Details'}
              </button>
            </div>

            <div className="kitsum__detail">
              {count === 0 ? (
                <div className="kitsum__empty">
                  <div className="kitsum__slots" aria-hidden="true">
                    {PRODUCTS.map((p) => (
                      <span key={p.code} />
                    ))}
                  </div>
                  <p>Noch leer. Wähl links Farbe und Menge – oder nimm einen Schnellstart.</p>
                </div>
              ) : (
                <ul className="kitsum__lines">
                  {Object.entries(lines).map(([sku, qty]) => {
                    const p = PRODUCTS.find((x) => x.variants.some((v) => v.sku === sku))!;
                    const v = p.variants.find((x) => x.sku === sku) as Variant;
                    const view = cardLook(p, v.color);
                    return (
                      <li key={sku} className="kitsum__line">
                        <span className="kitsum__thumb">{view && <Picture k={view.k} alt="" sizes="56px" />}</span>
                        <span className="kitsum__what">
                          <b>
                            {qty}× {p.name}
                          </b>
                          <span className="mono dim-3">{[colorName(v.color), v.option].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="kitsum__lp">{formatEuro(v.priceCents * qty)}</span>
                        <button type="button" className="kitsum__x" aria-label={`${p.name} entfernen`} onClick={() => setQty(sku, 0)}>
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="kitsum__goals" aria-live="polite">
                <div className="goal">
                  <div className="goal__text">
                    {totals.bundleActive ? (
                      <span>
                        <b className="goal__ok">✓ −{V.percent} %</b> auf {totals.discountFor.join(' + ')}
                      </span>
                    ) : progress ? (
                      <span>
                        Noch{' '}
                        <b>
                          {V.minQty - Math.min(progress.have, V.minQty)}× {progress.name}
                        </b>{' '}
                        → −{V.percent} %
                      </span>
                    ) : (
                      <span className="dim-3">−{V.percent} % ab 3 IFAK oder 3 Range Bags</span>
                    )}
                  </div>
                  <div className="goal__seg" aria-hidden="true">
                    {Array.from({ length: V.minQty }, (_, i) => (
                      <i key={i} className={(totals.bundleActive ? V.minQty : (progress?.have ?? 0)) > i ? 'is-on' : ''} />
                    ))}
                  </div>
                </div>
                <div className="goal">
                  <div className="goal__text">
                    {count === 0 ? (
                      <span className="dim-3">Versandkostenfrei ab {formatEuro(SHOP.shipping.freeFromCents)}</span>
                    ) : totals.missingForFreeShippingCents === 0 ? (
                      <span>
                        <b className="goal__ok">✓ Versandkostenfrei</b>
                      </span>
                    ) : (
                      <span>
                        Noch <b>{formatEuro(totals.missingForFreeShippingCents)}</b> bis versandkostenfrei
                      </span>
                    )}
                  </div>
                  <div className="goal__bar" aria-hidden="true">
                    <i style={{ transform: `scaleX(${shipPct / 100})` }} />
                  </div>
                </div>
              </div>

              <dl className="kitsum__sums">
                <div>
                  <dt>Einzelpreise</dt>
                  <dd className={totals.discountCents ? 'is-struck' : ''}>{formatEuro(totals.subtotalCents)}</dd>
                </div>
                {totals.discountCents > 0 && (
                  <div className="is-save">
                    <dt>Du sparst</dt>
                    <dd>−{formatEuro(totals.discountCents)}</dd>
                  </div>
                )}
                <div>
                  <dt>Versand</dt>
                  <dd>{count === 0 ? '–' : totals.shippingCents ? formatEuro(totals.shippingCents) : 'kostenlos'}</dd>
                </div>
              </dl>
            </div>

            <div className="kitsum__foot">
              <div className="kitsum__total" aria-live="polite">
                <span className="mono dim-3">Summe</span>
                <strong>{formatEuro(count ? totals.totalCents : 0)}</strong>
              </div>
              <button
                ref={btn}
                type="button"
                className={`btn btn--signal tab kitsum__cta${done ? ' is-done' : ''}`}
                disabled={count === 0 || done}
                onClick={() => {
                  pull(btn.current);
                  add(cart);
                  setDone(true);
                  window.setTimeout(() => {
                    setLines({});
                    setDone(false);
                    setOpenSum(false);
                  }, 1400);
                }}
              >
                {done ? '✓ Im Warenkorb' : ctaText}
              </button>
              <span className="kitsum__note mono dim-3">Rabatt gilt auch bei gemischten Farben.</span>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
