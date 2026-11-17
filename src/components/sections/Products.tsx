'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PRODUCTS } from '@/data/shop';
import { OPEN_EVENT, jumpToEl, scrollToEl, scrollToY, useMotion } from '../MotionProvider';
import { Picture } from '../Picture';
import { ProductStage } from './ProductStage';
import { Arsenal } from './Arsenal';
import { Vitrine, firstLook } from './Vitrine';

type VT = { finished: Promise<void>; skipTransition?: () => void };
type VTDoc = Document & { startViewTransition?: (cb: () => void) => VT };
/** Kamerafahrt: welches Teil, Richtung, und ob die Auslage gerade „herangezoomt“ ist (andere Teile dunkel) */
type Fly = { slug: string; dir: 'in' | 'out'; zoomed: boolean };

/** Dauer der Kamerafahrt in ms (hin / zurück) und Zeit, in der danach das scharfe Foto einblendet */
const FLY_IN = 1100;
const FLY_OUT = 950;
const LAND = 340;
/** bis hierhin laufen die Zeilen der Kaufkarte nacheinander ein (siehe vitrine.css, .is-arriving) */
const ARRIVE = 2000;
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';

const isSlug = (s: string) => PRODUCTS.some((p) => p.slug === s);
const shown = (el: HTMLElement | null | undefined): el is HTMLElement => !!el && el.getClientRects().length > 0;

/** Fläche, die das Foto in seinem Rahmen wirklich einnimmt (object-fit: contain) */
function photoRect(box: HTMLElement) {
  const r = box.getBoundingClientRect();
  const pics = [...box.querySelectorAll<HTMLElement>('picture')];
  const img = (pics.find((p) => p.style.opacity !== '0') ?? box).querySelector('img');
  const ar = img ? Number(img.getAttribute('width')) / Number(img.getAttribute('height')) || 1 : 1;
  const w = r.width / r.height > ar ? r.height * ar : r.width;
  const h = w / ar;
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w, h };
}

/**
 * Ausrüstung: erst die Auslage (alle Teile nebeneinander). Ein Klick fährt wie eine Kamera auf das Teil zu –
 * die anderen Teile wandern aus dem Bild, auf halbem Weg kommt die Kaufkarte dazu, am Ende steht das Teil
 * groß in seiner Produktbühne. „Zur Auslage“ fährt denselben Weg zurück.
 * Alle Produktbühnen bleiben im HTML (für Suchmaschinen), sichtbar ist nur das geöffnete Teil.
 */
export function Products() {
  const [open, setOpen] = useState<string | null>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  const [arriving, setArriving] = useState(false);
  const openRef = useRef<string | null>(null);
  const busy = useRef(false);
  const arriveT = useRef(0);
  const section = useRef<HTMLElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const backBtn = useRef<HTMLButtonElement>(null);
  /** Mobil: welche Karte im Karussell gerade vorn ist */
  const mobileIdx = useRef(0);
  const { reduced } = useMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const swap = useCallback((next: string | null, mode: 'fly' | 'scroll' | 'jump' = 'fly') => {
    const sec = section.current;
    const det = detail.current;
    if (!sec || !det || busy.current) return;
    const prev = openRef.current;
    if (next === prev) {
      if (next && mode !== 'fly') scrollToEl(det, -72);
      return;
    }

    const vit = sec.querySelector<HTMLElement>('.vitrine');
    const row = sec.querySelector<HTMLElement>('.vitrine__row');
    const tile = (slug: string) => sec.querySelector<HTMLElement>(`.vitem[data-slug="${slug}"] .vitem__shot`);
    /** das sichtbare große Foto eines Teils: Bühne (Desktop) oder Karte (Handy) */
    const big = (slug: string) => {
      const a = document.getElementById(slug)?.querySelector<HTMLElement>('.stage__frame');
      if (shown(a)) return a;
      const b = document.getElementById(`${slug}-karte`)?.querySelector<HTMLElement>('.pcard__shot');
      return shown(b) ? b : null;
    };
    const arsenalOn = () => shown(sec.querySelector<HTMLElement>('.products__arsenal'));
    /** Handy: Karussell direkt auf die gewählte Karte stellen */
    const snapCard = (slug: string) => {
      const card = document.getElementById(`${slug}-karte`);
      const track = card?.parentElement;
      if (card && track && shown(card)) {
        track.scrollLeft = card.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft);
        mobileIdx.current = PRODUCTS.findIndex((p) => p.slug === slug);
      }
    };
    /** Kamerastellung, in der das Kachelfoto genau auf dem großen Foto liegt */
    const closeUp = (slug: string) => {
      const from = tile(slug);
      const to = big(slug);
      if (!row || !from || !to) return null;
      const a = photoRect(from);
      const b = photoRect(to);
      const o = row.getBoundingClientRect();
      const s = b.h / a.h;
      return `translate(${b.cx - o.left - s * (a.cx - o.left)}px, ${b.cy - o.top - s * (a.cy - o.top)}px) scale(${s})`;
    };
    /** Seitenposition der geschlossenen Auslage: Überschrift + Auslage zusammen, wenn beides auf den Bildschirm passt */
    const closedY = () => {
      const secTop = sec.getBoundingClientRect().top + window.scrollY;
      if (!vit) return secTop - 64;
      const vitTop = vit.offsetTop;
      const fits = vitTop + vit.offsetHeight <= window.innerHeight - 64;
      return fits ? secTop - 64 : secTop + vitTop - 84;
    };
    const settle = (focus: HTMLElement | null | undefined) => {
      ScrollTrigger.refresh();
      history.replaceState(null, '', openRef.current ? `#${openRef.current}` : location.pathname + location.search);
      focus?.focus({ preventScroll: true });
    };
    const still = reducedRef.current || !row || typeof row.animate !== 'function';

    // ---- Wechsel zwischen zwei geöffneten Teilen: weiches Überblenden ----
    if (prev && next) {
      const apply = () => {
        openRef.current = next;
        flushSync(() => setOpen(next));
        snapCard(next);
      };
      const doc = document as VTDoc;
      if (still || typeof doc.startViewTransition !== 'function') {
        apply();
        settle(null);
      } else {
        busy.current = true;
        document.documentElement.classList.add('pl-vt');
        const t = doc.startViewTransition(apply);
        const guard = window.setTimeout(() => t.skipTransition?.(), 1500);
        t.finished.finally(() => {
          clearTimeout(guard);
          document.documentElement.classList.remove('pl-vt');
          busy.current = false;
          settle(null);
        });
      }
      if (mode === 'scroll') scrollToEl(det, -72);
      return;
    }

    // ---- Öffnen ----
    if (next) {
      const flying = mode === 'fly' && !still;
      openRef.current = next;
      flushSync(() => {
        setOpen(next);
        if (flying) {
          setFly({ slug: next, dir: 'in', zoomed: true });
          setArriving(true);
        }
      });
      snapCard(next);
      const T = flying ? closeUp(next) : null;
      if (!T || !vit || !row) {
        // ohne Kamerafahrt (Direktlink, Anker von außen, „Bewegung reduzieren“)
        flushSync(() => {
          setFly(null);
          setArriving(false);
        });
        if (mode === 'scroll') scrollToEl(det, -72);
        else jumpToEl(det, -72);
        settle(mode === 'fly' ? backBtn.current : null);
        return;
      }
      busy.current = true;
      // Die Auslage liegt jetzt als Ebene über der Produktbühne – an derselben Stelle wie zuvor
      // (position: absolute ohne top → bleibt genau dort stehen, wo sie im Seitenfluss stand)
      const anim = row.animate([{ transform: 'translate(0px, 0px) scale(1)' }, { transform: T }], {
        duration: FLY_IN,
        easing: EASE,
        fill: 'forwards',
      });
      scrollToEl(det, -72, FLY_IN / 1000);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        flushSync(() => setFly(null));
        anim.cancel();
        busy.current = false;
        settle(backBtn.current);
      };
      // kurz stehen lassen, bis das scharfe Foto der Bühne eingeblendet ist
      anim.finished.then(() => window.setTimeout(finish, LAND)).catch(() => finish());
      window.setTimeout(finish, FLY_IN + LAND + 700);
      clearTimeout(arriveT.current);
      arriveT.current = window.setTimeout(() => setArriving(false), ARRIVE);
      return;
    }

    // ---- Zurück zur Auslage ----
    const leaving = prev && arsenalOn() ? (PRODUCTS[mobileIdx.current]?.slug ?? prev) : prev!;
    const focusTile = () => sec.querySelector<HTMLElement>(`.vitem[data-slug="${leaving}"]`);
    clearTimeout(arriveT.current);
    if (mode !== 'fly' || still || !vit || !row || !big(leaving)) {
      openRef.current = null;
      flushSync(() => {
        setOpen(null);
        setFly(null);
        setArriving(false);
      });
      jumpToEl(sec, -64);
      settle(focusTile());
      return;
    }
    busy.current = true;
    flushSync(() => {
      setArriving(false);
      setFly({ slug: leaving, dir: 'out', zoomed: true });
    });
    const T = closeUp(leaving) ?? 'translate(0px, 0px) scale(1)';
    const anim = row.animate([{ transform: T }, { transform: 'translate(0px, 0px) scale(1)' }], {
      duration: FLY_OUT,
      easing: EASE,
      fill: 'both',
    });
    // einen Moment später geht in der Auslage das Licht wieder an (andere Teile, Schilder, weißer Grund)
    window.setTimeout(() => setFly((f) => (f ? { ...f, zoomed: false } : f)), 60);
    scrollToY(closedY(), FLY_OUT / 1000);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      openRef.current = null;
      flushSync(() => {
        setOpen(null);
        setFly(null);
      });
      anim.cancel();
      busy.current = false;
      settle(focusTile());
    };
    anim.finished.then(finish).catch(finish);
    window.setTimeout(finish, FLY_OUT + 700);
  }, []);

  /** Zeiger auf einem Teil: großes Foto schon laden, damit es nach der Kamerafahrt sofort scharf dasteht */
  const peek = useCallback((slug: string) => {
    for (const sel of [`#${slug} .stage__shot img`, `#${slug}-karte .pcard__shot img`]) {
      const img = document.querySelector<HTMLImageElement>(sel);
      if (img) img.loading = 'eager';
    }
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

  const cls = ['products', arriving && 'is-arriving', fly?.dir === 'out' && 'is-leaving'].filter(Boolean).join(' ');

  return (
    <section ref={section} className={cls} id="ausruestung" aria-labelledby="products-h">
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

      <Vitrine
        hidden={open !== null && !fly}
        flying={!!fly}
        zoomed={!!fly?.zoomed}
        sel={fly?.slug ?? null}
        onOpen={(slug) => swap(slug)}
        onPeek={peek}
      />

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
