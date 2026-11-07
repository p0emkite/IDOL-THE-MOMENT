-- ITM card studio: allow the existing administrator-only RLS policy to delete members.
-- Applied to ENCORE-IDOL-CARDS (isyrthdznnbxjyoliwgf); do not run on RKBO.
-- The itm_members_admin FOR ALL policy still requires private.itm_is_studio_admin().
grant delete on table public.itm_members to authenticated;
