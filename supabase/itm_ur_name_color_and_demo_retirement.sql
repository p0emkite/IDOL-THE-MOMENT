-- ITM 2026-11-06: retire the non-persistent default/demo pack and
-- allow administrators to customize the metallic UR name in full-screen art.
-- Applied to Supabase project isyrthdznnbxjyoliwgf.
-- NOTE: Legacy itm-demo-* inventory is deliberately deleted; real cards and
-- user-created managed packs remain intact.
BEGIN;
ALTER TABLE public.itm_catalog
  ADD COLUMN IF NOT EXISTS ur_name_color text NOT NULL DEFAULT '#f0c76d';
ALTER TABLE public.itm_catalog DROP CONSTRAINT IF EXISTS itm_catalog_ur_name_color_check;
ALTER TABLE public.itm_catalog
  ADD CONSTRAINT itm_catalog_ur_name_color_check
  CHECK (ur_name_color ~ '^#[0-9A-Fa-f]{6}$');

REVOKE ALL ON FUNCTION public.itm_open_demo_pack(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.itm_open_card_pack(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.itm_import_guest_demo(jsonb)
  FROM PUBLIC, anon, authenticated;

DELETE FROM public.itm_demo_inventory;
DELETE FROM public.itm_card_pack_rolls
 WHERE pack_id IS NULL AND result::text LIKE '%itm-demo-%';
COMMIT;

-- The supported path for draws is now:
-- public.itm_open_managed_pack(p_count integer,p_pack_id uuid).
-- Existing published cards in public.itm_catalog and their live inventory
-- in public.itm_card_inventory must NOT be deleted.
