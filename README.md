# ITM — IDOL : THE MOMENT · v0.4

An independent, fan-made idol photocard pack-opening webgame prototype. Built separately from RTM and its database.

**Latest update:** ITM rebranding, replacing all on-screen ENCORE branding including 3D textures, recovery-code issuance and UI; server ID and all existing collections stay unchanged. Guest identity and cross-device recovery work without Google sign-in when Anonymous Sign-Ins are enabled.

**Branding note:** The current Supabase dashboard name is still `ENCORE-IDOL-CARDS` (project ID `isyrthdznnbxjyoliwgf`). The connector cannot rename the Supabase project display name, but UI/game identities are now ITM; renaming the dashboard project to `IDOL-THE-MOMENT` is cosmetic and must not create a new project. `EN-...` recovery codes issued under the old brand remain valid; new codes use `IT-...`. The existing local-only demo inventory key remains readable so the rebrand does not lose test cards.

## Currently implemented

- Cinematic stage layout with experimental Three.js pack/card rendering and a 2D fallback if the external 3D dependency cannot load
- 1-card / 5-card pack openings, card flip reveals, rarity effects, pack odds, collection, original synthetic card art
- Supabase project `ENCORE-IDOL-CARDS` in the same organization (`p0emkite`) as RTM but with a **separate project, database, Auth system and collection**
- Automatic anonymous guest identity at first visit (requires enabling Supabase Anonymous Sign-Ins)
- Player collection independent of the browser's anonymous Auth user ID
- 128-bit randomly generated, one-time-displayed IT-prefixed recovery code, stored as a SHA-256 hash on the server
- Restore on another device with that code; existing collections are **not automatically merged**
- Server-authoritative pack drawing, 2-second rate limit between openings per player, owner-only collection reads with RLS, private elevated functions and public invoker wrappers
- No `service_role`/secret key in public code; only Supabase publishable key in `config.js`

## Supabase project

- **Current Supabase display name:** `ENCORE-IDOL-CARDS` (technical alias until renamed in dashboard)
- **ID:** `isyrthdznnbxjyoliwgf`
- **Organization:** `p0emkite`
- **Region:** Tokyo (`ap-northeast-1`)
- **Dashboard:** https://supabase.com/dashboard/project/isyrthdznnbxjyoliwgf
- **Schema:** three migrations have been **applied successfully** to this project; initial 16 fictional cards retained
- Existing `RKBO-ONLINE` project and RTM code have **not** been edited.

### One required Supabase dashboard setting

Open **Authentication → Providers → Anonymous Sign-Ins** and enable it for this NEW project:

https://supabase.com/dashboard/project/isyrthdznnbxjyoliwgf/auth/providers

This provider switch is **not exposed** by the connected Supabase management tools in this chat, so it has not been confirmed enabled. Until it is enabled, a new browser cannot create the guest Auth session that makes cloud collection synchronization possible. The UI displays a connection error with the relevant explanation rather than claiming cloud sync works.

For a public release, enable anti-bot/CAPTCHA protections and monitor anonymous-sign-in quotas and costs. Never enable paid options without reviewing the charges.

### How guest recovery works

1. Launch the website. The client requests a Supabase anonymous sign-in and creates a private player ID.
2. Packs are drawn on the server and stored under that player ID. Browser reloads keep the anonymous session until its local credentials are lost.
3. Open **ITM ID → 새 복구 코드 발급**, copy the entire code and store it somewhere secure. **The raw code appears only once.**
4. On a new browser/device, open **ITM ID**, enter the same code and select **기존 도감 연결하기**. This new anonymous session becomes linked to the original player ID and sees the original collection.
5. Existing local collections are not merged. A device's existing collection is left in its original player account when switched; it can be recovered only if it has its own valid recovery code or retained session.
6. A newly issued recovery code invalidates the previous recovery code but **does not revoke devices already linked** to that player. Device revocation is a future feature.

**Security:** Anyone who obtains the code can access the account's collection. Treat it like a password; do not post it online. Losing both the code and all signed-in devices can cause permanent loss of access. Server backups and operational policies matter: storage is not an unconditional lifetime guarantee.

### Deployment to GitHub Pages

1. Use the existing repository `p0emkite/IDOL-THE-MOMENT`. The GitHub connector in this environment can update files in existing repositories but does not expose the create-repository action.
2. Upload all files at the root of this ZIP to the repository's main branch. Enable **GitHub Pages → Deploy from a branch** (or set up a CI-based static deployment).
3. Activate Supabase Anonymous Sign-Ins from the link above. **Google OAuth is not needed.**
4. Visit the deployed URL, issue a code on one device, open a pack, and restore the account on another device to validate real end-to-end cloud synchronization.

To run locally, serve the directory over HTTP rather than opening `index.html` as a local file:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000/ . External Three.js and Supabase JS modules require internet access; the 2D fallback displays if 3D cannot load.

### Development files

```text
index.html                           page, scene, modals
style.css                            layout, cards, account UI, mobile responsiveness
app.js                               effects, collection, auth and recovery code
config.js                            publishable-only Supabase client configuration
assets/favicon.svg                  original favicon
supabase/schema.sql                 first migration, initial sample catalog
supabase/guest_recovery_migration.sql second migration, current guest identity model
supabase/itm_branding_migration.sql   third migration, IT-prefixed recovery codes / legacy EN compatible
tests/test_guest_flow.py            offline/mocked cross-device UI integration test
```

**SQL caution:** The recovery migration drops the original demo-only inventory and roll tables and should not be applied to any pre-existing production database with user data. It has **already been applied** to the new ITM project; do not run it again. Do not apply it to RTM.

## Testing and limitations

- JavaScript syntax checked.
- Offline browser integration test (mocked Supabase) passed: new guest → issue code → 5-card pack → reveal → collection → new independent browser → restore → matching collection, no uncaught JS errors.
- Remote database schema, policies and function privileges checked via connected Supabase. Table access uses RLS. The security advisor reports informational notices for deliberately policy-free private tables; no high severity findings were reported.
- **True, live client-to-Supabase anonymous sign-in and recovery across physical devices have not yet been verified**, because Anonymous Sign-Ins may need to be enabled in the dashboard and no public website has been deployed.
- The three-dimensional WebGL effect has not been verified in the offline test environment. The tested browser flow used the 2D fallback. Dedicated pack models, custom particle shaders, lighting, sound design and real licensed idol artwork are future work.
- The demo uses fictional groups/artwork. Do not insert copyrighted celebrity photos, logos, or music into a public website without the necessary rights.

**Brand naming:** `RTM` (RKBO THE MOMENT) and `ITM` (IDOL : THE MOMENT) share a brand family, not a database, account or cloud bucket. GitHub repository suggested: `p0emkite/IDOL-THE-MOMENT` (create it first).