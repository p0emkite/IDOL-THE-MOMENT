# ITM — IDOL : THE MOMENT

A fan-made idol photocard pack-opening browser game. The current N/R/SR/SSR/UR cards are fictional demo content. ITM uses its own GitHub repository and Supabase project, separate from RTM.

## Current features (November 4, 2026)

- Three.js interactive pack opening (2D fallback), 1-card and 5-card test packs, flip reveals, collection.
- First-visit account gate: **Login**, **Sign up**, or **Guest play**.
- **Guest:** stores test-card collection only in the current browser's `localStorage` (`itm-test-pack-inventory-v1`). No server registration and no cross-device recovery. Private/incognito windows have separate, short-lived storage.
- **Named account:** uses username + password with Supabase Auth. An Edge Function creates a confirmed, internal non-deliverable email alias from the username. Supabase Auth stores salted password **hashes**, never plaintext passwords in GitHub or game tables.
- **Registered collection:** server-owned `public.itm_demo_inventory` keyed to `private.player_accounts`, RLS for the current named user; server RPC handles 1/5-card draws.
- **Guest-to-account conversion:** on first sign-up, the current browser's demo inventory is imported once to the registered player's cloud inventory. Subsequent logins use cloud data and do not silently overwrite it with a guest cache.
- **Logout:** clears the named Auth session; guest inventory in the same browser remains separate.
- Previous ITM recovery-code feature is still available under the signed-in account's advanced section, for older server-linked collections (not a password reset system).
- Improved 3D canvas bounds: no oversized canvas outside the scene wrapper, clipping enabled, pack buttons above the scene and pointer events active only during reveal.

### Username and password rules

Username: 4–20 lowercase ASCII letters, digits or underscores; must start with a letter (uppercase input is normalized). Password: 10–72 characters, including at least one letter and digit.

Named accounts use internal aliases like `itm.<username>@accounts.itm.example`. **These are deliberately not real inboxes. Password reset by email is unavailable.** Users should store passwords safely. A dedicated recovery or email-verification flow should be built before a large public launch.

### Key architecture

| Source | Purpose |
|---|---|
| `index.html` | Home screen, first-visit account modal, collection |
| `style.css` | Responsive layout, canvas clipping, account UI |
| `app.js` | Three.js effects, guest/local inventory, Supabase Auth and cloud inventory |
| `pack-opening.css` | Pack/cinematic styling |
| `config.js` | Publishable Supabase project URL and key only |
| `supabase/functions/itm-register/index.ts` | Edge Function for secure named account creation |
| `supabase/itm_named_accounts_demo_inventory.sql` | Database migration for named demo collection and protections |
| `supabase/guest_recovery_migration.sql` | Earlier anonymous guest and recovery-code model (kept for compatibility) |
| `supabase/itm_branding_migration.sql` | IT-prefixed recovery code migration |

### Supabase

ITM-only project: `isyrthdznnbxjyoliwgf` (dashboard display name may still be ENCORE-IDOL-CARDS).
Dashboard: https://supabase.com/dashboard/project/isyrthdznnbxjyoliwgf

The account API endpoint is `https://isyrthdznnbxjyoliwgf.supabase.co/functions/v1/itm-register`.

**Security notes:** `SUPABASE_SERVICE_ROLE_KEY` is used only inside the deployed Edge Function. The client is configured with a publishable key and uses Supabase Auth sessions. The database exposes read-only inventory to authenticated named account owners, and writes occur only through authenticated server RPCs. Registration requests are rate-limited per client, with an origin allowlist; CAPTCHA and additional abuse prevention are advisable for scale. Older Auth anonymous sessions are not treated as the new browser-only guest mode.

The previous anonymous-sign-in option is not necessary for the **new local guest** experience. Do not re-run earlier destructive migrations on a database containing production users.

### Deploy and verify

GitHub Pages can serve `index.html` directly from the `main` branch. No package build is needed for the main UI. Confirm that the live hostname is allowed by the registration Edge Function. After deployment, check:

1. New browser: account-choice modal opens; guest path explicitly warns about local-only collection.
2. Guest: open a pack, refresh the same browser, confirm collection remains; incognito should not inherit it.
3. Guest with cards: create username/password account, confirm imported cards appear in cloud collection.
4. Different device/browser: sign in using same username/password; confirm collection and quantities match.
5. Log out: named cards disappear, browser guest inventory remains.
6. Pack buttons remain clickable; the scene is clipped and 3D cards are clickable only in reveal.
7. No secrets or plaintext passwords are printed in client code, logs or files.

### Verification status

Source JS parsed successfully; DOM ID bindings checked. Supabase tables, functions, RLS and the registration Edge Function deployment were confirmed through the linked project. **Live browser end-to-end account signup/sign-in and cross-device behavior have not yet been exercised.** The previous mocked guest-recovery test predates the named account flow and must not be taken as proof of the new signup UI.

This prototype is free, uses demo art and is not affiliated with any artist, agency or official card product.
