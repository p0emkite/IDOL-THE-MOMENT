-- ITM: optional per-collection UR splash MP3.
-- Applied to ENCORE-IDOL-CARDS (isyrthdznnbxjyoliwgf), not RKBO.
-- Each record is identified by the existing (group_slug, name) unique pair.
-- Existing RLS: public read, studio admins only may insert/update/delete.
alter table public.itm_series
  add column if not exists ur_audio_path text;
comment on column public.itm_series.ur_audio_path is
  'Optional MP3 in itm-bgm Storage, triggered when the matching collection UR full-screen art appears.';
