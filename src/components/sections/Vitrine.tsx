'use client';

import { useEffect, useRef } from 'react';
import { COLORS, COLOR_NO, PRODUCTS, formatEuro, minPrice, type ColorKey, type Product } from '@/data/shop';
import { Picture, hasMedia, mediaMeta } from '../Picture';
import { useMotion } from '../MotionProvider';

/**
 * Wie jedes Teil in seiner Karte steht – freigestellte Ansicht (scripts/auslage-freistellen.py, nur Hintergrund weg).
 * key  = freigestelltes Bild für die Karte · from = Original-Bühnenfoto, auf dem es beim Öffnen landet
 * lage = wo der Ausschnitt im Originalfoto liegt (Anteile l, t, r, b; Ausgabe des Skripts)
 * crop = wo das Produkt im freigestellten Bild liegt (Anteile, gemessen)
 * h / w = größte Höhe bzw. Breite des Produkts als Anteil der Bildfläche → optisch ausgewogene Größen
 */
type Look = { key: string; from: string; lage: [number, number, number, number]; crop: [number, number, number, number]; h: number; w: number };
const LOOK: Record<string, Look> = {
  PL_KWT: { key: 'av-rb-schwarz-front', from: 'rb-schwarz-front', lage: [0.08545, 0.14062, 0.91406, 0.86328], crop: [0.0194, 0.0223, 0.9806, 0.9777], h: 0.74, w: 0.88 },
  PL_AP: { key: 'av-dp-schwarz-front', from: 'dp-schwarz-front', lage: [0.10417, 0.14105, 0.92477, 0.88767], crop: [0.024, 0.0192, 0.976, 0.9796], h: 0.92, w: 0.84 },
  PL_IFAK: { key: 'av-med-schwarz-front', from: 'med-schwarz-front', lage: [0.21631, 0.0752, 0.78223, 0.92969], crop: [0.0287, 0.0196, 0.9713, 0.9804], h: 0.78, w: 0.74 },
  PL_GR: { key: 'sl-schwarz-stand', from: 'sl-schwarz-stand', lage: [0, 0, 1, 1], crop: [0.12, 0.16, 0.88, 0.86], h: 0.72, w: 0.74 },
};

/** Farben in Code-Reihenfolge und das erste Foto der ersten lieferbaren Farbe (= Startbild der Produktbühne) */
export function firstLook(p: Product) {
  const colors = [...new Set(p.variants.map((v) => v.color))].sort((a, b) => COLOR_NO[a].localeCompare(COLOR_NO[b]));
  const color: ColorKey =
    colors.find((c) => p.variants.some((v) => v.color === c && v.stock !== 'ausverkauft')) ?? colors[0];
  return { colors, color, shot: (p.stage[color] ?? []).find(hasMedia) };
}

/** Bild der Karte: freigestellt, wenn es zum Startbild der Bühne passt; sonst das Startbild selbst */
function cardShot(code: string, shot: string | undefined) {
  const look = LOOK[code];
  if (look && look.from === shot && hasMedia(look.key)) return { k: look.key, look };
  return shot ? { k: shot, look: undefined } : undefined;
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
          const { colors, shot } = firstLook(p);
          const from = minPrice(p);
          const many = p.variants.some((v) => v.priceCents !== from);
          const card = cardShot(p.code, shot);
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
