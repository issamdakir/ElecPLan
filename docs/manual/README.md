# User manual / Manuel utilisateur

The manual is written in Markdown, one file per language. The PDF and HTML are build outputs:
edit the `.md` files as features change, and build when you package the app.

| Language | Source | Output |
|---|---|---|
| English (default) | `manual.en.md` | `docs/ElecPlan_Manual.pdf`, `manual_en.html` |
| Français | `manual.fr.md` | `docs/ElecPlan_Manuel.pdf`, `manual_fr.html` |

## Building

From the repository root:

```bash
npm run manual          # Markdown → HTML → PDF, both languages (a few seconds)
npm run manual -- en    # one language only
npm run manual:shots    # retake the screenshots from the running app (about a minute)
npm run dist            # runs manual:shots and manual first (predist), then builds the packages
```

Requirements: **pandoc** (`sudo apt install pandoc`) for Markdown → HTML. The PDF is printed by
Electron's own Chromium (already in `node_modules`), so no browser is needed. `manual:shots` also
needs `pdftoppm` (`poppler-utils`) for the A3 export preview.

## Editing

- `manual.en.md` and `manual.fr.md` have the same chapters in the same order; change both.
- Each `#` heading starts a new chapter on a new page and gets a number; `##` is a section.
- The front matter at the top (between `---`) fills the cover, the contents title and the page footer.
- Pandoc Markdown extras used here:
  - `::: note` … `:::` for a highlighted note, `::: card` … `:::` for a boxed paragraph,
    `::: steps` around a numbered list for the two-column steps;
  - `![caption](img/en/file.png){width=60%}` for a figure with a caption and a width;
  - `<kbd>Ctrl+S</kbd>` for keys (raw HTML is allowed anywhere);
  - in pipe tables, the length of each `|---|` separator sets the column's relative width.
- The annotated main-screen screenshot is a raw HTML block: each `.mk` badge has its position in %.
- Layout and colours are in `manual.css`; the cover and contents are in `tools/template.html`;
  the build script is `tools/build.js`.

Pages flow freely (no fixed page size per section), so text can grow without overflowing.

## Screenshots

`img/en/` and `img/fr/` are taken from the real application with a sample project (`tools/demo.js`),
so they match the interface. `tools/capture.js` uses a throwaway profile, never opens a dialog and
never calls Claude; the AI task shown is sample data. `s_*.png` are full-window shots (1500 × 920),
`c_*.png` are crops of the panel or plan, and `s_pdf.png` is page 1 of an A3 export.

## Fonts

Barlow, Barlow Condensed and JetBrains Mono are in `fonts/`, with their OFL licences: nothing to install.

---

*Le manuel s'écrit en Markdown : `manual.fr.md` (français) et `manual.en.md` (anglais), mêmes chapitres
dans le même ordre. `npm run manual` produit le HTML et le PDF (pandoc requis) ; `npm run dist` refait
d'abord les captures et le manuel.*
