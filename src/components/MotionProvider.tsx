'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { PRODUCTS } from '@/data/shop';

gsap.registerPlugin(ScrollTrigger);

type Motion = {
  /** prefers-reduced-motion */
  reduced: boolean;
  /** schwaches Gerät / Datensparmodus → 3D & Video vereinfachen */
  lowPower: boolean;
  /** Desktop-Layout mit gepinnten Bühnen */
  desktop: boolean;
  ready: boolean;
};

const MotionCtx = createContext<Motion>({ reduced: false, lowPower: false, desktop: true, ready: false });
export const useMotion = () => useContext(MotionCtx);

let lenisRef: Lenis | null = null;
/** Für Anker-Links: sanft scrollen, wenn Lenis aktiv ist */
export function scrollToId(id: string) {
  // Produkt-Anker: Die Produkte liegen in der Auslage → dort öffnen (Products.tsx hört auf dieses Ereignis)
  if (PRODUCTS.some((p) => p.slug === id)) {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    return;
  }
  const el = document.getElementById(id);
  if (!el) return;
  scrollToEl(el);
}
/** Ereignisname: ein Produkt in der Auslage öffnen (detail = slug) */
export const OPEN_EVENT = 'pl:open';
/** Sanft zu einem Element scrollen (unter die Kopfleiste) */
export function scrollToEl(el: HTMLElement, offset = -64, seconds?: number) {
  scrollToY(el.getBoundingClientRect().top + window.scrollY + offset, seconds);
}
/** Sanft zu einer Seitenposition scrollen; mit `seconds` im Takt einer Kamerafahrt (weich an- und abbremsen) */
export function scrollToY(y: number, seconds?: number) {
  const top = Math.max(0, y);
  const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  if (lenisRef) lenisRef.scrollTo(top, seconds ? { duration: seconds, easing: inOut, force: true } : {});
  else window.scrollTo({ top, behavior: 'smooth' });
}
/** Ohne Animation zu einer Seitenposition springen */
export function jumpToY(y: number) {
  const top = Math.max(0, y);
  if (lenisRef) lenisRef.scrollTo(top, { immediate: true, force: true });
  else window.scrollTo({ top, behavior: 'instant' });
}
/** Ohne Animation zu einem Element springen (z. B. innerhalb eines Ansichtswechsels) */
export function jumpToEl(el: HTMLElement, offset = -64) {
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY + offset);
  if (lenisRef) lenisRef.scrollTo(top, { immediate: true, force: true });
  else window.scrollTo({ top, behavior: 'instant' });
}
export function stopScroll(stop: boolean) {
  if (!lenisRef) return;
  if (stop) lenisRef.stop();
  else lenisRef.start();
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [m, setM] = useState<Motion>({ reduced: false, lowPower: false, desktop: true, ready: false });

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const weakCpu = (nav.hardwareConcurrency ?? 8) <= 4;
    const weakMem = (nav.deviceMemory ?? 8) <= 4;
    const saveData = !!nav.connection?.saveData;
    const lowPower = reduced || saveData || (weakCpu && weakMem);
    const desktop = window.matchMedia('(min-width: 961px)').matches;
    setM({ reduced, lowPower, desktop, ready: true });

    // Smooth Scroll nur ohne reduced-motion und mit Feinzeiger (Touch scrollt nativ)
    let lenis: Lenis | null = null;
    const fine = window.matchMedia('(pointer: fine)').matches;
    if (!reduced && fine) {
      lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
      lenisRef = lenis;
      lenis.on('scroll', ScrollTrigger.update);
      const raf = (t: number) => lenis!.raf(t * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
      (lenis as Lenis & { _raf?: (t: number) => void })._raf = raf;
    }

    // Einblenden beim Scrollen: typische Inhaltsblöcke automatisch markieren
    // (nur unterhalb des ersten Bildschirms → kein Flackern beim Laden)
    const RV = '.sec-head, .h2, .manifest__sub, .proof, .trust__cell, .voice, .pick, .mat, .tally, .panel__body, .pcard__body li, .explode__static li, .ftr__grid > div';
    const rvIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            rvIo.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    if (!reduced) {
      document.querySelectorAll<HTMLElement>(RV).forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) return;
        const sib = el.parentElement ? [...el.parentElement.children].filter((c) => c.matches(RV)) : [];
        el.style.setProperty('--d', `${Math.min(sib.indexOf(el), 6) * 70}ms`);
        el.classList.add('rv');
        rvIo.observe(el);
      });
    }

    // Scan-Effekt: jede .scan-Sektion einmal „abtasten“, wenn sie sichtbar wird
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-scanned');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.18 },
    );
    document.querySelectorAll('.scan').forEach((el) => io.observe(el));

    const onResize = () => setM((s) => ({ ...s, desktop: window.matchMedia('(min-width: 961px)').matches }));
    window.addEventListener('resize', onResize);

    return () => {
      io.disconnect();
      rvIo.disconnect();
      window.removeEventListener('resize', onResize);
      if (lenis) {
        const raf = (lenis as Lenis & { _raf?: (t: number) => void })._raf;
        if (raf) gsap.ticker.remove(raf);
        lenis.destroy();
        lenisRef = null;
      }
    };
  }, []);

  return <MotionCtx.Provider value={m}>{children}</MotionCtx.Provider>;
}

/** Pull-Tab-Mikrointeraktion: kurz am orangen Zugband ziehen */
export function pull(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove('is-pulled');
  void el.offsetWidth; // Reflow → Animation neu starten
  el.classList.add('is-pulled');
}
