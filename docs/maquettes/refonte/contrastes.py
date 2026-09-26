#!/usr/bin/env python3
"""Mesure des contrastes WCAG des jetons de la refonte (maquettes).

Usage : python contrastes.py            -> tableau ; code de sortie 1 si une paire échoue.
Les paires « texte » exigent >= 4,5:1 ; les paires « graphique » (liseré, focus) >= 3:1.
Les valeurs ci-dessous DOIVENT rester identiques à celles de maquette.css.
"""
import sys


def lum(hexa):
    h = hexa.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def melange(fg, bg, alpha):
    """Couleur fg à `alpha` posée sur bg (fond de badge à 10 %)."""
    f = fg.lstrip("#"); b = bg.lstrip("#")
    out = ""
    for i in (0, 2, 4):
        out += "%02x" % round(int(f[i:i + 2], 16) * alpha + int(b[i:i + 2], 16) * (1 - alpha))
    return "#" + out


SOMBRE = dict(bg="#07090D", surface="#0E1014", hl="#15181E", titre="#F8FAFC", corps="#CBD5E1",
              meta="#94A3B8", primary="#E6EAF2", sur_primary="#07090D", accent="#93A0FF",
              ok="#34D399", warn="#FBBF24", danger="#F87171", info="#60A5FA",
              danger_fond="#DC2626", sur_danger="#FFFFFF")
CLAIR = dict(bg="#F6F6F4", surface="#FFFFFF", hl="#EDEDE9", titre="#1D1D1B", corps="#33363B",
             meta="#585D66", primary="#1D1D1B", sur_primary="#F6F6F4", accent="#4338CA",
             ok="#047857", warn="#92400E", danger="#B91C1C", info="#1D4ED8",
             danger_fond="#B91C1C", sur_danger="#FFFFFF")

# Couleurs d'app d'EXEMPLE (dans le vrai hub elles viennent du contrat) + texteSur choisi.
APPS = {"app-1": "#2DD4BF", "app-2": "#60A5FA", "app-3": "#FB923C",
        "app-4": "#A3E635", "app-5": "#F472B6", "app-6": "#D6C7A1"}
TEXTE_SUR_SOMBRE, TEXTE_SUR_CLAIR = "#0B0D12", "#FFFFFF"


def paires(t):
    p = []
    for fond in ("bg", "surface"):
        p += [(f"titre / {fond}", t["titre"], t[fond], 4.5), (f"corps / {fond}", t["corps"], t[fond], 4.5),
              (f"meta / {fond}", t["meta"], t[fond], 4.5), (f"accent (texte) / {fond}", t["accent"], t[fond], 4.5),
              (f"focus primary / {fond}", t["primary"], t[fond], 3.0)]
    p.append(("bouton primary : texte / fond", t["sur_primary"], t["primary"], 4.5))
    p.append(("bouton danger : texte / fond", t["sur_danger"], t["danger_fond"], 4.5))
    for nom in ("ok", "warn", "danger", "info"):
        fond = melange(t[nom], t["surface"], 0.10)
        p.append((f"pastille {nom} : texte / fond 10 %", t[nom], fond, 4.5))
    return p


def main():
    echec = 0
    for nom, t in (("SOMBRE", SOMBRE),):
        print(f"== {nom}")
        for lib, a, b, seuil in paires(t):
            r = ratio(a, b)
            ok = r >= seuil
            echec += not ok
            print(f"  {'OK ' if ok else 'ÉCHEC'} {r:5.2f}  (>= {seuil})  {lib}  {a} sur {b}")
    print("== COULEURS D'APP (texteSur)")
    for nom, c in APPS.items():
        for th, ts in (("sombre", TEXTE_SUR_SOMBRE),):
            r = ratio(ts, c)
            ok = r >= 4.5
            echec += not ok
            print(f"  {'OK ' if ok else 'ÉCHEC'} {r:5.2f}  {nom} {c} : texteSur {ts}")
    for nom, c in APPS.items():
        # liseré / pastille de couleur : graphique >= 3:1 contre le fond de carte
        for th, t in (("sombre", SOMBRE),):
            r = ratio(c, t["surface"])
            note = "OK " if r >= 3.0 else "FAIBLE"
            print(f"  {note} {r:5.2f}  liseré {nom} {c} sur surface {th}"
                  + ("" if r >= 3.0 else " -> renforcé par un contour (le liseré ne porte jamais seul l'état)"))
    return 1 if echec else 0


if __name__ == "__main__":
    sys.exit(main())
