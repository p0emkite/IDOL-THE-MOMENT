# ITM official brand assets

The project owner supplied and approved two official assets on 2026-11-04.

| Asset | Target filename | Role | Source dimensions |
| --- | --- | --- | --- |
| Official ITM logo | `assets/itm-logo.png` | Primary game logo, header branding and 3D pack artwork | 1254 × 1254 PNG, RGBA with transparency |
| Official ITM card back | `assets/itm-card-back.png` | Reverse face of every collectible card, unrevealed cards and 2D fallback | 1060 × 1484 PNG |

Use these original assets **instead of** a recreated placeholder or an invented generic design. Preserve their aspect ratios, colors, and official lettering. Keep the card back the same regardless of rarity; front card art and animations may vary. The logo belongs to **IDOL : THE MOMENT (ITM)**, an independent sister project to **RKBO THE MOMENT (RTM)**.

**Integration status:** source images were provided in the project chat. The updated v0.5 source package including both PNG files was prepared there. The two PNGs must be uploaded to this repository at the exact target paths above before the live GitHub Pages site can use them. Current GitHub connector here supports UTF-8 file writes but not direct binary uploads; this markdown inventory does not mean the images are present in the repository.

For the updated website implementation, make sure the HTML header and pack texture use `./assets/itm-logo.png`, and Three.js + 2D fallback card backs use `./assets/itm-card-back.png`; keep a procedural fallback if assets fail to load.
