'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PRODUCTS } from '@/data/shop';
import { OPEN_EVENT, jumpToEl, scrollToEl, useMotion } from '../MotionProvider';
import { Picture } from '../Picture';
import { ProductStage } from './ProductStage';
import { Arsenal } from './Arsenal';
import { Vitrine, firstLook } from './Vitrine';

type VT = { finished: Promise<void>; skipTransition?: () => void };
type VTDoc = Document & { startViewTransition?: (cb: () => void) => VT };

const isSlug = (s: string) => PRODUCTS.some((p) => p.slug === s);
const shown = (el: HTMLElement | null | undefined): el is HTMLElement => !!el && el.getClientRects().length > 0;

/**
 * Ausrüstung: erst die Auslage (alle Teile nebeneinander), ein Klick fährt nah an ein Teil heran –
 * das Foto wächst in die Produktbühne, die Kaufkarte kommt dazu. „Zur Auslage“ fährt zurück.
 * Alle Produktbühnen bleiben im HTML (für Suchmaschinen), sichtbar ist nur das geöffnete Teil.
 */
export function Products() {
  const [open, setOpen] = useState<string | null>(null);
  const openRef = useRef<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const backBtn = useRef<HTMLButtonElement>(null);
  /** Mobil: welche Karte im Karussell gerade vorn ist */
  const mobileIdx = useRef(0);
  const { reduced } = useMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const swap = useCallback((next: string | null, mode: 'morph' | 'scroll' | 'jump' = 'morph') => {
    const sec = section.current;
    if (!sec) return;
    const prev = openRef.current;
    if (next === prev) {
      if (next && detail.current && mode !== 'morph') scrollToEl(detail.current, -72);
      return;
    }

    const tile = (slug: string) => sec.querySelector<HTMLElement>(`.vitem[data-slug="${slug}"] .vitem__shot`);
    /** das sichtbare große Foto eines Teils: Bühne (Desktop) oder Karte (Handy) */
    const big = (slug: string) => {
      const a = document.getElementById(slug)?.querySelector<HTMLElement>('.stage__frame');
      if (shown(a)) return a;
      const b = document.getElementById(`${slug}-karte`)?.querySelector<HTMLElement>('.pcard__shot');
      return shown(b) ? b : null;
    };
    const arsenalOn = () => shown(sec.querySelector<HTMLElement>('.products__arsenal'));
    /** beim Zurückfahren: auf dem Handy zählt die Karte, die gerade vorn ist */
    const leaving = prev && arsenalOn() ? (PRODUCTS[mobileIdx.current]?.slug ?? prev) : prev;

    const apply = () => {
      openRef.current = next;
      flushSync(() => setOpen(next));
      if (next) {
        // Handy: Karussell direkt auf die gewählte Karte stellen
        const card = document.getElementById(`${next}-karte`);
        const track = card?.parentElement;
        if (card && track && shown(card)) {
          track.scrollLeft = card.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft);
          mobileIdx.current = PRODUCTS.findIndex((p) => p.slug === next);
        }
      }
    };
    const place = () => {
      if (mode === 'scroll') return;
      if (next && !prev && detail.current) jumpToEl(detail.current, -72);
      if (!next) {
        const vit = sec.querySelector<HTMLElement>('.vitrine');
        if (!vit) return;
        // Überschrift + Auslage zusammen zeigen, wenn beides auf den Bildschirm passt
        const fits = vit.getBoundingClientRect().bottom - sec.getBoundingClientRect().top <= window.innerHeight - 64;
        jumpToEl(fits ? sec : vit, fits ? -64 : -84);
      }
    };
    const settle = () => {
      ScrollTrigger.refresh();
      history.replaceState(null, '', next ? `#${next}` : location.pathname + location.search);
      if (mode === 'scroll' && next && detail.current) scrollToEl(detail.current, -72);
      if (next && !prev) backBtn.current?.focus({ preventScroll: true });
      if (!next && leaving) sec.querySelector<HTMLElement>(`.vitem[data-slug="${leaving}"]`)?.focus({ preventScroll: true });
    };

    const doc = document as VTDoc;
    if (mode !== 'morph' || reducedRef.current || typeof doc.startViewTransition !== 'function') {
      apply();
      place();
      settle();
      return;
    }

    // Ansichtswechsel mit „Kamerafahrt“: Das Foto des Teils wandert zwischen Auslage und Bühne
    const named: HTMLElement[] = [];
    const name = (el: HTMLElement | null | undefined, n: string) => {
      if (!el) return;
      el.style.setProperty('view-transition-name', n);
      named.push(el);
    };
    const clear = () => named.splice(0).forEach((el) => el.style.removeProperty('view-transition-name'));

    if (!prev && next) name(tile(next), 'pl-shot');
    if (prev && !next && leaving) name(big(leaving), 'pl-shot');
    document.documentElement.classList.add('pl-vt');
    const t = doc.startViewTransition(() => {
      clear();
      apply();
      place();
      if (!prev && next) {
        name(big(next), 'pl-shot');
        const sheet = document.getElementById(next)?.querySelector<HTMLElement>('.sheet');
        if (shown(sheet)) name(sheet, 'pl-sheet');
      }
      if (prev && !next && leaving) name(tile(leaving), 'pl-shot');
    });
    // Sicherung: hängt der Übergang (z. B. Tab im Hintergrund), nach 2 s direkt zum Endzustand springen
    const guard = window.setTimeout(() => t.skipTransition?.(), 2000);
    t.finished.finally(() => {
      clearTimeout(guard);
      clear();
      document.documentElement.classList.remove('pl-vt');
      settle();
    });
  }, []);

  // Anker von außen (Kopfzeile, Hero, Packliste): Teil öffnen und hinscrollen
  useEffect(() => {
    const onOpen = (e: Event) => {
      const slug = (e as CustomEvent<string>).detail;
      if (isSlug(slug)) swap(slug, 'scroll');
    };
    const onHash = () => {
      const slug = decodeURIComponent(location.hash.slice(1));
      if (isSlug(slug)) swap(slug, 'scroll');
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener('hashchange', onHash);
    // Direktlink, z. B. /#ifak
    const first = decodeURIComponent(location.hash.slice(1));
    if (isSlug(first)) swap(first, 'jump');
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener('hashchange', onHash);
    };
  }, [swap]);

  // Esc fährt zurück zur Auslage (nicht, wenn Warenkorb oder Kasse offen sind)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open], [aria-modal="true"]')) return;
      const r = section.current?.getBoundingClientRect();
      if (r && r.bottom > 0 && r.top < window.innerHeight) swap(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, swap]);

  return (
    <section ref={section} className="products" id="ausruestung" aria-labelledby="products-h">
      <div className="wrap">
        <div className="sec-head mono">
          <span className="sec-head__label" id="products-h">
            Ausrüstung – 4 Teile
          </span>
          <span className="dim-3">PL_KWT · PL_AP · PL_IFAK · PL_GR</span>
        </div>
        <h2 className="display h2">
          Vier Teile.
          <br />
          <span className="dim">Keine Kompromisse.</span>
        </h2>
      </div>

      <Vitrine hidden={open !== null} onOpen={(slug) => swap(slug)} />

      <div ref={detail} className="products__detail" hidden={open === null}>
        <div className="wrap vbar">
          <button ref={backBtn} type="button" className="vbar__back mono" onClick={() => swap(null)}>
            <span aria-hidden="true">←</span> Zur Auslage
          </button>
          {/* Schnellwechsel zwischen den Teilen (Desktop; auf dem Handy wischt man durchs Karussell) */}
          <div className="vbar__tabs" role="group" aria-label="Teil wechseln">
            {PRODUCTS.map((p) => {
              const { shot } = firstLook(p);
              return (
                <button
                  key={p.code}
                  type="button"
                  className="vbar__tab mono"
                  aria-pressed={open === p.slug}
                  aria-label={`${p.name} (${p.code})`}
                  onClick={() => swap(p.slug)}
                >
                  <span className="vbar__thumb">{shot ? <Picture k={shot} alt="" sizes="48px" /> : null}</span>
                  {p.code}
                </button>
              );
            })}
          </div>
        </div>
        {/* Desktop: Produktbühne des gewählten Teils · Handy: Wisch-Karussell */}
        <div className="products__stages">
          {PRODUCTS.map((p, i) => (
            <div key={p.code} hidden={open !== p.slug}>
              <ProductStage product={p} index={i} />
            </div>
          ))}
        </div>
        <div className="products__arsenal">
          <Arsenal onActive={(i) => (mobileIdx.current = i)} />
        </div>
      </div>
    </section>
  );
}
