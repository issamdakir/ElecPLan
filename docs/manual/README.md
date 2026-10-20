# Manuel utilisateur

Source du manuel `docs/ElecPlan_Manuel.pdf` (15 pages A4).

```bash
cd docs/manual
python3 build_manual.py          # → manual.html
google-chrome --headless=new --no-pdf-header-footer \
  --print-to-pdf=../ElecPlan_Manuel.pdf "file://$PWD/manual.html"
```

Polices requises (Google Fonts, licence OFL) : Barlow, Barlow Condensed, JetBrains Mono.
Sans elles, Chrome utilise des polices de remplacement et la mise en page change.

Captures : `s_*.png` = écran entier (fenêtre 1500 × 920), `c_*.png` = détails du panneau.
