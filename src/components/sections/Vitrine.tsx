'use client';

import { useEffect, useRef } from 'react';
import { COLORS, COLOR_NO, PRODUCTS, formatEuro, minPrice, type ColorKey, type Product } from '@/data/shop';
import { Picture, hasMedia, mediaMeta } from '../Picture';
import { useMotion } from '../MotionProvider';
import cutsData from '@/data/auslage.generated.json';

/**
 * Freigestellte Ansicht des ersten Fotos jeder Farbe (scripts/auslage-freistellen.py, nur Hintergrund weg).
 * je Bühnenfoto: key = freigestelltes Bild · lage = Ausschnitt im Original (Anteile l,t,r,b) · crop = Produkt im freigestellten Bild
 */
type Cut = { key: string; lage: number[]; crop: number[] };
const CUTS = cutsData as Record<string, Cut>;
/** größte Höhe bzw. Breite des Produkts als Anteil der Bildfläche → optisch ausgewogene Größen auf einer Standlinie */
const SIZE: Record<string, { h: number; w: number }> = {
  PL_KWT: { h: 0.74, w: 0.88 },
  PL_AP: { h: 0.92, w: 0.84 },
  PL_IFAK: { h: 0.78, w: 0.74 },
  PL_GR: { h: 0.72, w: 0.74 },
};
type Look = Cut & { from: string; h: number; w: number };

/** Farben in Code-Reihenfolge und das erste Foto der ersten lieferbaren Farbe (= Startbild der Produktbühne) */
export function firstLook(p: Product) {
  const colors = [...new Set(p.variants.map((v) => v.color))].sort((a, b) => COLOR_NO[a].localeCompare(COLOR_NO[b]));
  const color: ColorKey =
    colors.find((c) => p.variants.some((v) => v.color === c && v.stock !== 'ausverkauft')) ?? colors[0];
  return { colors, color, shot: (p.stage[color] ?? []).find(hasMedia) };
}

/** Ansicht eines Teils in einer Farbe: freigestelltes Bild, wenn vorhanden – sonst das erste Bühnenfoto */
export function cardLook(p: Product, color?: ColorKey) {
  const c = color && p.stage[color] ? color : firstLook(p).color;
  const from = (p.stage[c] ?? []).find(hasMedia);
  if (!from) return undefined;
  const cut = CUTS[from];
  const size = SIZE[p.code] ?? { h: 0.75, w: 0.8 };
  if (cut && hasMedia(cut.key)) return { k: cut.key, look: { ...cut, from, ...size } as Look };
  return { k: from, look: undefined };
}

/** CSS-Variablen, mit denen das Foto so groß und so platziert wird, dass das Produkt genau auf der Standlinie steht */
function placement(look: Look) {
  const meta = mediaMeta(look.key);
  const ar = meta.w / meta.h;
  const [l, t, r, b] = look.crop;
  return {
    '--ar': ar,
    '--ch': b - t,
    '--pa': ((r - l) * ar) / (b - t),
    '--bt': 1 - b,
    '--cx': (l + r) / 2,
    '--mh': look.h,
    '--mw': look.w,
  } as React.CSSProperties;
}

/**
 * Die Auslage: vier gleich große Karten, jedes Teil auf derselben Standlinie.
 * Zeiger auf eine Karte → dieses Teil hebt sich, die anderen treten zurück.
 * Klick → Products.tsx lässt das Foto in die Produktbühne fliegen (die Karten blenden dabei aus).
 */
export function Vitrine({
  hidden,
  phase,
  sel,
  colors: chosen,
  onOpen,
  onPeek,
}: {
  hidden: boolean;
  /**
   * picking = Licht aus: nur das gewählte Teil bleibt stehen · leaving = Foto fliegt zur Bühne
   * returning = Foto fliegt zurück, Karten blenden wieder ein
   */
  phase: 'picking' | 'leaving' | 'returning' | null;
  sel: string | null;
  /** zuletzt gewählte Farbe je Teil (slug) → die Karte zeigt das Teil in dieser Farbe */
  colors: Record<string, ColorKey>;
  onOpen: (slug: string) => void;
  onPeek: (slug: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { ready, reduced } = useMotion();

  // Auftritt: Teile stellen sich nacheinander auf, sobald die Auslage sichtbar wird
  useEffect(() => {
    const el = root.current;
    if (!el || !ready || reduced) return;
    // nur vorbereiten, wenn die Auslage noch unter dem Bildschirm liegt (sonst flackert sie beim Laden)
    if (el.hidden || el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('is-armed');
    let done = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.classList.add('is-in');
        io.disconnect();
        done = window.setTimeout(() => el.classList.remove('is-armed', 'is-in'), 1600);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(done);
      el.classList.remove('is-armed', 'is-in');
    };
  }, [ready, reduced]);

  return (
    <div
      ref={root}
      className={`vitrine${phase ? ` is-${phase}` : ''}`}
      hidden={hidden}
      aria-hidden={phase === 'leaving' || phase === 'picking' || undefined}
    >
      <ul className="vgrid">
        {PRODUCTS.map((p, i) => {
          const { colors } = firstLook(p);
          const from = minPrice(p);
          const many = p.variants.some((v) => v.priceCents !== from);
          const card = cardLook(p, chosen[p.slug]);
          const place = card?.look ? placement(card.look) : undefined;
          return (
            <li key={p.code} className={`vcard${sel === p.slug ? ' is-sel' : ''}`} style={{ ['--i' as string]: i }}>
              <button
                type="button"
                className="vcard__btn"
                data-slug={p.slug}
                data-from={card?.look?.from}
                data-lage={card?.look?.lage.join(',')}
                tabIndex={phase ? -1 : undefined}
                onClick={() => onOpen(p.slug)}
                onPointerEnter={() => onPeek(p.slug)}
                onFocus={() => onPeek(p.slug)}
                aria-label={`${p.name} ansehen – ${many ? 'ab ' : ''}${formatEuro(from)}, ${colors.length} ${colors.length === 1 ? 'Farbe' : 'Farben'}`}
              >
                <span className="vcard__top mono" aria-hidden="true">
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span>{p.code}</span>
                </span>
                <span className={`vcard__media${place ? ' is-placed' : ''}`} aria-hidden="true">
                  {card ? (
                    <Picture k={card.k} alt="" sizes="(max-width: 900px) 50vw, 30vw" className="vcard__shot" style={place} />
                  ) : null}
                  <span className="vcard__go mono">
                    Ansehen <i>→</i>
                  </span>
                </span>
                <span className="vcard__info" aria-hidden="true">
                  <span className="vcard__cat mono">{p.category}</span>
                  <span className="vcard__name display">{p.name}</span>
                  <span className="vcard__row">
                    <span className="vcard__dots">
                      {colors.map((c) => (
                        <i key={c} style={{ background: COLORS[c].swatch }} />
                      ))}
                    </span>
                    <span className="vcard__price">
                      {many && <small>ab </small>}
                      {formatEuro(from)}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
