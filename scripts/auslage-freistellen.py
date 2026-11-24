"""Auslage: Produktfotos (weißer Grund) freistellen – NUR der Hintergrund wird entfernt.

Keine Farbkorrektur, kein Schatten, keine Retusche: die Pixel des Produkts bleiben, wie sie sind.
Das Bild wird auf das Produkt zugeschnitten (2 % Rand), damit es in der Auslage genau auf der Standlinie steht.

Aufruf (rembg-venv):
  node scripts/medien.mjs --freisteller-liste av- > liste.json
  python -I scripts/auslage-freistellen.py liste.json <medien>/freigestellt
  node scripts/medien.mjs av-
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

os.environ.setdefault("U2NET_HOME", str(Path.home() / ".shopify" / "modelle"))
from rembg import new_session, remove  # noqa: E402  (nach U2NET_HOME)

RAND = 0.02


def main(liste, ziel):
    ziel = Path(ziel)
    ziel.mkdir(parents=True, exist_ok=True)
    session = new_session("isnet-general-use")
    lage = {}
    for item in json.loads(Path(liste).read_text(encoding="utf-8-sig")):
        img = ImageOps.exif_transpose(Image.open(item["src"])).convert("RGB")
        out = remove(
            img,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=8,
        )
        rgb = np.asarray(img)
        m = np.asarray(out.getchannel("A")).astype(np.float32) / 255
        f = rgb.astype(np.float32)
        lum = f @ np.array([0.299, 0.587, 0.114], np.float32)
        sat = (f.max(2) - f.min(2)) / np.maximum(f.max(2), 1)
        # Produktbereich: Modell-Maske PLUS alle dunklen Flächen, die damit verbunden sind
        # (das Modell übersieht z. B. Teile eines dünnen Schultergurts)
        dunkel = lum < 225
        lab, n = ndimage.label((m > 0.3) | dunkel)
        if n:
            treffer = ndimage.sum(m > 0.5, lab, range(1, n + 1))
            bereich = np.isin(lab, [i + 1 for i, t in enumerate(treffer) if t > 0.01 * treffer.max()])
        else:
            bereich = m > 0.3
        bereich = ndimage.binary_dilation(bereich, iterations=4)
        # 1) Kern: sicheres Innere laut Modell (Glanzlichter auf dem Stoff bleiben deckend)
        kern = ndimage.binary_erosion(m > 0.85, iterations=4).astype(np.float32)
        # 2) Helligkeit: alles Dunkle ist Produkt (z. B. dünne, gewebte Gurte), Weiß ist Hintergrund
        key = np.clip((246 - lum) / 30, 0, 1)
        # helle, glatte, farblose Stellen (weißer Grund zwischen Teilen, Kante unter der Tasche) entscheidet allein die Helligkeit
        mu5 = ndimage.uniform_filter(lum, 5)
        std5 = np.sqrt(np.maximum(ndimage.uniform_filter(lum * lum, 5) - mu5 * mu5, 0))
        kern[(lum > 222) & (sat < 0.08) & (std5 < 6)] = 0
        a = np.maximum(kern, key) * bereich
        # 3) Eingeschlossene Reste (zwischen Tasche und Schultergurt) und Bodenschatten: glatt, hell, farblos.
        #    Hintergrund und Schatten sind glatt, Gewebe ist gemustert → das Produkt bleibt unberührt.
        mu = ndimage.uniform_filter(lum, 7)
        std = np.sqrt(np.maximum(ndimage.uniform_filter(lum * lum, 7) - mu * mu, 0))
        glatt = (std < 2.5) & (sat < 0.08)
        keim = glatt & (lum > 236)
        lab, n = ndimage.label(keim)
        if n:
            groessen = ndimage.sum(np.ones_like(lum), lab, range(1, n + 1))
            weg = np.isin(lab, [i + 1 for i, g in enumerate(groessen) if g > 0.00012 * lum.size])
            darf = glatt & (lum > 178)
            for _ in range(600):
                neu = ndimage.binary_dilation(weg) & darf
                if not (neu & ~weg).any():
                    break
                weg |= neu
            weich = ndimage.gaussian_filter(ndimage.binary_dilation(weg).astype(np.float32), 0.7)
            a = a * (1 - np.clip(weich * 1.5, 0, 1))
        # Bodenschatten-Schleier (hellgrau, glatt, farblos) ausblenden – dunkles Gewebe bleibt unberührt
        schleier = (sat < 0.08) & (std5 < 8) & (lum > 186)
        a = np.where(schleier, a * np.clip((210 - lum) / 24, 0, 1), a)
        # 4) Krümel weg
        lab, n = ndimage.label(a > 0.5)
        if n > 1:
            groessen = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
            behalten = np.isin(lab, [i + 1 for i, g in enumerate(groessen) if g > 0.005 * groessen.max()])
            a = a * ndimage.binary_dilation(behalten, iterations=3)
        a = a * 255
        # Produktpixel unverändert aus dem Original, nur Alpha neu
        res = Image.fromarray(np.dstack([rgb, a.clip(0, 255).astype(np.uint8)]), "RGBA")
        bbox = res.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
        if bbox:
            pad = round(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * RAND)
            l, t, r, b = bbox
            box = (max(0, l - pad), max(0, t - pad), min(res.width, r + pad), min(res.height, b + pad))
            # Lage des Ausschnitts im Originalfoto (Anteile) → die Seite lässt das Foto genau dort landen
            lage[item["key"]] = [round(box[0] / img.width, 5), round(box[1] / img.height, 5), round(box[2] / img.width, 5), round(box[3] / img.height, 5)]
            res = res.crop(box)
        res.save(ziel / f"{item['key']}.png")
        print(f"OK {item['key']}: {img.size} -> {res.size}")
    print("LAGE " + json.dumps(lage))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
