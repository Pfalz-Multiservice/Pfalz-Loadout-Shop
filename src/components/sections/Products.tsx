'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PRODUCTS } from '@/data/shop';
import { OPEN_EVENT, jumpToEl, jumpToY, scrollToEl, scrollToY, useMotion } from '../MotionProvider';
import { Picture } from '../Picture';
import { ProductStage } from './ProductStage';
import { Arsenal } from './Arsenal';
import { Vitrine, firstLook } from './Vitrine';

type VT = { finished: Promise<void>; skipTransition?: () => void };
type VTDoc = Document & { startViewTransition?: (cb: () => void) => VT };
type Rect = { x: number; y: number; w: number; h: number };
type Phase = 'picking' | 'leaving' | 'returning' | null;

/** Flugdauer in ms (hin / zurück) */
const FLY_IN = 900;
const FLY_OUT = 800;
/** Ausrichten der Seite vor dem Flug (die Seite steht still, während das Foto fliegt) */
const ALIGN = 480;
/** so lange laufen die Zeilen der Kaufkarte nacheinander ein (vitrine.css, .is-arriving) */
const ARRIVE = 1800;
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const HDR = 64;
/** Abstand der Auslage bzw. des geöffneten Teils unter der Kopfleiste */
const GAP = 8;

const isSlug = (s: string) => PRODUCTS.some((p) => p.slug === s);
const shown = (el: Element | null | undefined): el is HTMLElement => !!el && el.getClientRects().length > 0;
const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Auf das Ende einer Animation warten – mit Sicherung: Läuft sie nicht (Tab im Hintergrund pausiert Animationen),
 * wird sie nach Ablauf der Zeit zu Ende gesetzt, damit die Seite nie in einem Zwischenzustand hängen bleibt.
 */
async function done(anim: Animation, ms: number) {
  const t = window.setTimeout(() => {
    try {
      anim.finish();
    } catch {}
  }, ms + 600);
  await anim.finished.catch(() => undefined);
  clearTimeout(t);
}

/** Sanft zu einer Seitenposition scrollen und warten, bis sie erreicht ist (danach exakt setzen) */
async function align(y: number) {
  const target = Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
  if (Math.abs(window.scrollY - target) < 3) return;
  scrollToY(target, ALIGN / 1000);
  const t0 = performance.now();
  while (Math.abs(window.scrollY - target) > 1 && performance.now() - t0 < ALIGN + 500) await wait(30);
  jumpToY(target);
}

/** Das große Foto eines Teils: Bühne (Desktop) oder Karte (Handy) – mit dem gerade sichtbaren Bild */
function bigPhoto(slug: string) {
  const frame = document.getElementById(slug)?.querySelector<HTMLElement>('.stage__frame');
  const box = shown(frame) ? frame : document.getElementById(`${slug}-karte`)?.querySelector<HTMLElement>('.pcard__shot');
  if (!shown(box)) return null;
  const pics = [...box.querySelectorAll<HTMLElement>('picture')];
  const pic = pics.find((p) => p.style.opacity !== '0') ?? pics[0];
  const img = pic?.querySelector('img');
  if (!img) return null;
  // Fläche, die das Foto im Rahmen wirklich einnimmt (object-fit: contain).
  // Gemessen am unbewegten Rahmen – das Foto selbst kann gerade eine Einblend-Animation (Skalierung) haben.
  const base = box.classList.contains('pcard__shot') && box.parentElement ? box.parentElement : box;
  const br = base.getBoundingClientRect();
  const r = { x: br.left + base.clientLeft, y: br.top + base.clientTop, w: base.clientWidth, h: base.clientHeight };
  const ar = Number(img.getAttribute('width')) / Number(img.getAttribute('height')) || 1;
  const w = r.w / r.h > ar ? r.h * ar : r.w;
  const h = w / ar;
  const key = (img.currentSrc || img.src).match(/\/media\/(.+)-\d+\.(?:webp|avif)/)?.[1];
  return { rect: { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h }, key, img };
}

/** Wo das freigestellte Bild der Karte auf dem großen Foto liegt */
function landing(slug: string, btn: HTMLElement) {
  const big = bigPhoto(slug);
  const lage = btn.dataset.lage?.split(',').map(Number);
  if (!big || !lage || lage.length !== 4 || big.key !== btn.dataset.from) return null;
  const [l, t, r, b] = lage;
  const P = big.rect;
  return { x: P.x + l * P.w, y: P.y + t * P.h, w: (r - l) * P.w, h: (b - t) * P.h };
}

/** Warten, bis das große Foto wirklich geladen und dekodiert ist (höchstens `max` ms) */
async function photoReady(slug: string, max = 2500) {
  const img = bigPhoto(slug)?.img;
  if (!img) return;
  img.loading = 'eager';
  if (!(img.complete && img.naturalWidth > 0)) {
    await Promise.race([
      new Promise<void>((res) => {
        img.addEventListener('load', () => res(), { once: true });
        img.addEventListener('error', () => res(), { once: true });
      }),
      wait(max),
    ]);
  }
  // geladen → kurz aufs Dekodieren warten (bleibt das Signal aus, nicht hängen bleiben)
  await Promise.race([img.decode().catch(() => undefined), wait(300)]);
}

/** Fliegendes Foto (eigene Ebene, fest positioniert) */
function makeGhost(src: string, at: Rect) {
  const g = document.createElement('img');
  g.className = 'pl-ghost';
  g.alt = '';
  g.decoding = 'sync';
  g.src = src;
  place(g, at);
  document.body.appendChild(g);
  return g;
}
function place(g: HTMLElement, r: Rect) {
  Object.assign(g.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
}
/** Foto von `from` nach `to` fliegen lassen (liegt fest am Ziel, startet per Transform an der Ausgangsstelle) */
function fly(g: HTMLElement, from: Rect, to: Rect, duration: number) {
  place(g, to);
  const s = from.w / to.w;
  return g.animate(
    [{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${s})` }, { transform: 'none' }],
    { duration, easing: EASE, fill: 'both' },
  );
}

/**
 * Ausrüstung: erst die Auslage (vier Karten). Klick auf ein Teil:
 *   1. Licht aus – die anderen Teile blenden aus, die Seite richtet sich ruhig aus (das Teil wandert mit).
 *   2. Bei stehender Seite fliegt das freigestellte Foto in die Produktbühne, die Kaufkarte kommt Zeile für Zeile.
 *   3. Übergabe erst, wenn das große Foto geladen ist; danach erscheinen Infopunkte, Schloss usw.
 * „Zur Auslage“ fliegt denselben Weg zurück. Alle Produktbühnen bleiben im HTML (für Suchmaschinen).
 */
export function Products() {
  const [open, setOpen] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [fx, setFx] = useState<string[]>([]);
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

  /** große Fotos eines Teils sofort laden (statt erst beim Sichtbarwerden) */
  const peek = useCallback((slug: string) => {
    for (const s of [`#${slug} .stage__shot img`, `#${slug}-karte .pcard__shot img`]) {
      document.querySelectorAll<HTMLImageElement>(s).forEach((img) => (img.loading = 'eager'));
    }
  }, []);

  const swap = useCallback(
    async (next: string | null, mode: 'fly' | 'scroll' | 'jump' = 'fly') => {
      const sec = section.current;
      const det = detail.current;
      if (!sec || !det || busy.current) return;
      const prev = openRef.current;
      if (next === prev) {
        if (next && mode !== 'fly') scrollToEl(det, -HDR - GAP);
        return;
      }
      const btnOf = (slug: string) => sec.querySelector<HTMLElement>(`.vcard__btn[data-slug="${slug}"]`);
      const tileImg = (slug: string) => btnOf(slug)?.querySelector<HTMLImageElement>('.vcard__shot img') ?? null;
      /** Handy: Karussell direkt auf die gewählte Karte stellen */
      const snapCard = (slug: string) => {
        const card = document.getElementById(`${slug}-karte`);
        const track = card?.parentElement;
        if (card && track && shown(card)) {
          track.scrollLeft = card.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft);
          mobileIdx.current = PRODUCTS.findIndex((p) => p.slug === slug);
        }
      };
      const topOf = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY - HDR - GAP;
      const settle = (focus: HTMLElement | null | undefined) => {
        ScrollTrigger.refresh();
        history.replaceState(null, '', openRef.current ? `#${openRef.current}` : location.pathname + location.search);
        focus?.focus({ preventScroll: true });
      };
      const still = reducedRef.current || typeof Element.prototype.animate !== 'function';

      // ---- Wechsel zwischen zwei geöffneten Teilen: weiches Überblenden ----
      if (prev && next) {
        peek(next);
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
        if (mode === 'scroll') scrollToEl(det, -HDR - GAP);
        return;
      }

      // ---- Öffnen ----
      if (next) {
        peek(next);
        const img = tileImg(next);
        const btn = btnOf(next);
        const vit = sec.querySelector<HTMLElement>('.vitrine');
        if (mode !== 'fly' || still || !img || !btn || !vit || !shown(img)) {
          // ohne Flug (Direktlink, Anker von außen, „Bewegung reduzieren“)
          openRef.current = next;
          flushSync(() => setOpen(next));
          snapCard(next);
          if (mode === 'scroll') scrollToEl(det, -HDR - GAP);
          else jumpToEl(det, -HDR - GAP);
          settle(mode === 'fly' ? backBtn.current : null);
          return;
        }
        busy.current = true;
        clearTimeout(arriveT.current);
        // 1. Licht aus, Seite ausrichten (Auslage und geöffnetes Teil beginnen an derselben Stelle)
        flushSync(() => {
          setPhase('picking');
          setSel(next);
        });
        await Promise.all([align(topOf(vit)), wait(320)]);
        // 2. Umschalten – die Seite steht jetzt still
        const from = rectOf(img);
        openRef.current = next;
        flushSync(() => {
          setOpen(next);
          setPhase('leaving');
          setFx(['fly-hide', 'is-arriving']);
        });
        snapCard(next);
        const to = landing(next, btn);
        if (!to) {
          flushSync(() => {
            setPhase(null);
            setSel(null);
            setFx([]);
          });
          busy.current = false;
          settle(backBtn.current);
          return;
        }
        const g = makeGhost(img.currentSrc || img.src, from);
        const anim = fly(g, from, to, FLY_IN);
        arriveT.current = window.setTimeout(() => setFx((f) => f.filter((c) => c !== 'is-arriving')), ARRIVE);
        // Rahmen baut sich erst kurz vor der Landung um das ankommende Foto auf
        await wait(FLY_IN * 0.68);
        setFx((f) => ['fly-frame', ...f.filter((c) => c !== 'fly-hide')]);
        await done(anim, FLY_IN);
        // 3. Übergabe erst, wenn das große Foto geladen ist
        await photoReady(next);
        flushSync(() => {
          setFx((f) => ['fly-land', ...f.filter((c) => c !== 'fly-frame')]);
          setPhase(null);
          setSel(null);
        });
        await wait(420); // großes Foto blendet unter dem fliegenden ein
        await done(g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease', fill: 'forwards' }), 200);
        g.remove();
        // erst jetzt: Infopunkte, Schloss, Bildwechsel
        setFx((f) => f.filter((c) => c !== 'fly-land'));
        busy.current = false;
        settle(backBtn.current);
        return;
      }

      // ---- Zurück zur Auslage ----
      const leaving =
        prev && shown(sec.querySelector('.products__arsenal')) ? (PRODUCTS[mobileIdx.current]?.slug ?? prev) : prev!;
      const btn = btnOf(leaving);
      const img = tileImg(leaving);
      const instant = () => {
        openRef.current = null;
        flushSync(() => {
          setOpen(null);
          setPhase(null);
          setSel(null);
          setFx([]);
        });
        jumpToEl(sec.querySelector<HTMLElement>('.vitrine') ?? sec, -HDR - GAP);
        settle(btnOf(leaving));
      };
      clearTimeout(arriveT.current);
      if (mode !== 'fly' || still || !btn || !img) return instant();
      busy.current = true;
      // 0. Seite so ausrichten, dass das Teil an derselben Stelle beginnt wie die Auslage
      await align(topOf(det));
      const B = landing(leaving, btn);
      if (!B) {
        busy.current = false;
        return instant();
      }
      // 1. Foto übernimmt, Bühne und Kaufkarte blenden aus
      const g = makeGhost(img.currentSrc || img.src, B);
      flushSync(() => setFx(['fly-frame', 'fly-out']));
      await wait(300);
      // 2. Umschalten: Auslage liegt genau dort, wo das Teil war → Foto fliegt bei stehender Seite in seine Karte
      openRef.current = null;
      flushSync(() => {
        setOpen(null);
        setPhase('returning');
        setSel(leaving);
        setFx([]);
      });
      const A = rectOf(img);
      await done(fly(g, B, A, FLY_OUT), FLY_OUT);
      flushSync(() => {
        setPhase(null);
        setSel(null);
      });
      g.remove();
      busy.current = false;
      settle(btnOf(leaving));
    },
    [peek],
  );

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

  // Aufräumen, falls die Seite mitten im Flug verlassen wird
  useEffect(() => () => document.querySelectorAll('.pl-ghost').forEach((g) => g.remove()), []);

  return (
    <section ref={section} className={['products', ...fx].join(' ')} id="ausruestung" aria-labelledby="products-h">
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
        hidden={open !== null && phase === null}
        phase={phase}
        sel={sel}
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
                  onPointerEnter={() => peek(p.slug)}
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
