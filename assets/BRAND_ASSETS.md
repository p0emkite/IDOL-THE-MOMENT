# ITM official brand assets

The project owner supplied and approved two official assets on 2026-11-04.

| Asset | Target filename | Role | Source dimensions |
| --- | --- | --- | --- |
| Official ITM logo | `assets/itm-logo.png` | Primary game logo, header branding and 3D pack artwork | 1254 × 1254 PNG, RGBA with transparency |
| Official ITM card back | `assets/itm-card-back.png` | Reverse face of every collectible card, unrevealed cards and 2D fallback | 1060 × 1484 PNG |

Use these original assets **instead of** a recreated placeholder or an invented generic design. Preserve their aspect ratios, colors, and official lettering. Keep the card back the same regardless of rarity; front card art and animations may vary. The logo belongs to **IDOL : THE MOMENT (ITM)**, an independent sister project to **RKBO THE MOMENT (RTM)**.

**Integration status:** both official original PNG files were uploaded to `main` on 2026-11-04, and their blob SHA and byte sizes were verified against the supplied source images. The live GitHub Pages website can now serve `assets/itm-logo.png` and `assets/itm-card-back.png`.

For the updated website implementation, make sure the HTML header and pack texture use `./assets/itm-logo.png`, and Three.js + 2D fallback card backs use `./assets/itm-card-back.png`; keep a procedural fallback if assets fail to load.

## Unified front-card design (approved 2026-11-05)

The new **MOMENT FRAME** is implemented in `card-frame.js` and used by the 3D reveal, 2D fallback and collection views via `renderITMCard(card, {photo, groupLogo})`.

- All rarities (N, R, SR, SSR, UR) use an identical 512 × 746 logical-pixel composition rendered at 1024 × 1492 for crisp scaling.
- Rarity is shown **only in the top-right angled tab**; a single centered four-point crown star and sweeping orbital lines define the common frame language.
- UR uses a **muted pastel rainbow prism** on its border, top-right grade tab, and crown star. The SR frame remains lavender-violet.
- **No ITM logo or upper-right star cluster** appears on the card face. The official ITM branding remains appropriate on the game's header, packs and shared card backs.
- The **full-bleed picture slot is intentionally blank** in this version. Future card-add UI will supply `photo` as a separately loaded image.
- The **bottom-right group logo slot is intentionally blank**; future card-add UI will supply `groupLogo`, contained in a maximum 132 × 65 logical-pixel area with its right edge at x=460 and bottom at y=682.
- No image or group logo is currently registered for these demo card fronts. Do not fill those slots with invented placeholder people or invented band logos.
- Live comparison of the five empty templates: `frame-preview.html`. Do not make special-case layouts per rarity.
