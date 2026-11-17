'use client';

import { useEffect, useRef } from 'react';
import { COLORS, COLOR_NO, PRODUCTS, formatEuro, minPrice, type ColorKey, type Product } from '@/data/shop';
import { Picture, hasMedia } from '../Picture';
import { useMotion } from '../MotionProvider';

/**
 * Darstellung je Produkt in der Auslage:
 * f    = Breite des Bildrahmens (3:4) relativ zum größten Teil → die Teile stehen im echten Größenverhältnis
 * drop = Leerraum unter dem Produkt im Rahmen (Anteil der Rahmenhöhe) → alle Teile stehen auf derselben Kante
 */
const LOOK: Record<string, { f: number; drop: number }> = {
  PL_KWT: { f: 0.98, drop: 0.241 },
  PL_AP: { f: 1, drop: 0.129 },
  PL_IFAK: { f: 0.76, drop: 0.1925 },
  PL_GR: { f: 0.6, drop: 0.13 },
};

/** Farben in Code-Reihenfolge und das erste Foto der ersten lieferbaren Farbe (= Startbild der Produktbühne) */
export function firstLook(p: Product) {
  const colors = [...new Set(p.variants.map((v) => v.color))].sort((a, b) => COLOR_NO[a].localeCompare(COLOR_NO[b]));
  const color: ColorKey =
    colors.find((c) => p.variants.some((v) => v.color === c && v.stock !== 'ausverkauft')) ?? colors[0];
  return { colors, color, shot: (p.stage[color] ?? []).find(hasMedia) };
}

/**
 * Die Auslage: alle Teile stehen nebeneinander auf einer Kante.
 * Zeiger auf ein Teil → nur dieses bleibt „beleuchtet“, die anderen treten zurück.
 * Klick → Products.tsx fährt wie eine Kamera auf das Teil zu: Die Auslage liegt dann als Ebene über der
 * Produktbühne (flying), die anderen Teile und die Schilder sind ausgeblendet (zoomed).
 */
export function Vitrine({
  hidden,
  flying,
  zoomed,
  sel,
  onOpen,
  onPeek,
}: {
  hidden: boolean;
  flying: boolean;
  zoomed: boolean;
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
        if (e.isIntersecting) {
          el.classList.add('is-in');
          io.disconnect();
          // danach aufräumen: beim späteren Zurückfahren zur Auslage soll der Auftritt nicht noch einmal laufen
          done = window.setTimeout(() => el.classList.remove('is-armed', 'is-in'), 1800);
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(done);
      el.classList.remove('is-armed', 'is-in');
    };
  }, [ready, reduced]);

  // Leichte Kamerabewegung mit dem Zeiger (nur Maus): Teile verschieben sich je nach Größe unterschiedlich weit
  useEffect(() => {
    const el = root.current;
    if (!el || !ready || reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--px', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--px', '0');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [ready, reduced]);

  return (
    <div
      ref={root}
      className={`vitrine${flying ? ' is-flying' : ''}${zoomed ? ' is-zoomed' : ''}`}
      hidden={hidden}
      aria-hidden={flying || undefined}
    >
      <p className="vitrine__hint mono">
        <span aria-hidden="true" className="vitrine__pulse" />
        Teil wählen – näher rangehen
      </p>
      <ul className="vitrine__row">
        {PRODUCTS.map((p, i) => {
          const look = LOOK[p.code] ?? { f: 0.8, drop: 0.15 };
          const { colors, shot } = firstLook(p);
          const from = minPrice(p);
          const many = p.variants.some((v) => v.priceCents !== from);
          return (
            <li key={p.code} className={sel === p.slug ? 'is-sel' : undefined} style={{ ['--f' as string]: look.f, ['--drop' as string]: look.drop, ['--i' as string]: i }}>
              <button
                type="button"
                className="vitem"
                data-slug={p.slug}
                tabIndex={flying ? -1 : undefined}
                onClick={() => onOpen(p.slug)}
                onPointerEnter={() => onPeek(p.slug)}
                onFocus={() => onPeek(p.slug)}
              >
                <span className="vitem__shot">
                  {shot ? <Picture k={shot} alt="" sizes="(max-width: 700px) 60vw, 40vw" /> : null}
                </span>
                <span className="vitem__label">
                  <span className="vitem__code mono">
                    {String(i + 1).padStart(2, '0')} · {p.code}
                  </span>
                  <span className="vitem__name display">{p.name}</span>
                  <span className="vitem__meta mono">
                    <span className="vitem__dots" aria-hidden="true">
                      {colors.map((c) => (
                        <i key={c} style={{ background: COLORS[c].swatch }} />
                      ))}
                    </span>
                    <span className="sr-only">
                      {colors.length} {colors.length === 1 ? 'Farbe' : 'Farben'},{' '}
                    </span>
                    {many ? 'ab ' : ''}
                    {formatEuro(from)}
                  </span>
                  <span className="vitem__go mono">
                    Näher ran <span aria-hidden="true">→</span>
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
