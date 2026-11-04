# ITM official brand assets

The project owner supplied and approved two official assets on 2026-11-04.

| Asset | Target filename | Role | Source dimensions |
| --- | --- | --- | --- |
| Official ITM logo | `assets/itm-logo.png` | Primary game logo, header branding and 3D pack artwork | 1254 × 1254 PNG, RGBA with transparency |
| Official ITM card back | `assets/itm-card-back.png` | Reverse face of every collectible card, unrevealed cards and 2D fallback | 1060 × 1484 PNG |

Use these original assets **instead of** a recreated placeholder or an invented generic design. Preserve their aspect ratios, colors, and official lettering. Keep the card back the same regardless of rarity; front card art and animations may vary. The logo belongs to **IDOL : THE MOMENT (ITM)**, an independent sister project to **RKBO THE MOMENT (RTM)**.

**Integration status:** both official original PNG files were uploaded to `main` on 2026-11-04, and their blob SHA and byte sizes were verified against the supplied source images. The live GitHub Pages website can now serve `assets/itm-logo.png` and `assets/itm-card-back.png`.

For the updated website implementation, make sure the HTML header and pack texture use `./assets/itm-logo.png`, and Three.js + 2D fallback card backs use `./assets/itm-card-back.png`; keep a procedural fallback if assets fail to load.
