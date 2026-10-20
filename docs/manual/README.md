# Manuel utilisateur

Source du manuel `docs/ElecPlan_Manuel.pdf` (15 pages A4).

```bash
cd docs/manual
python3 build_manual.py          # → manual.html
google-chrome --headless=new --no-pdf-header-footer \
  --print-to-pdf=../ElecPlan_Manuel.pdf "file://$PWD/manual.html"
```

Les polices (Barlow, Barlow Condensed, JetBrains Mono) sont dans `fonts/`, avec leur licence OFL :
rien à installer.

Captures : `s_*.png` = écran entier (fenêtre 1500 × 920), `c_*.png` = détails du panneau.
