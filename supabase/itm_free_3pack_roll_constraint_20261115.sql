-- Free 3-card tickets are permitted, while paid draws remain 1/5/11 only via the existing server function.
alter table public.itm_card_pack_rolls drop constraint if exists itm_card_pack_rolls_pack_size_check;
alter table public.itm_card_pack_rolls add constraint itm_card_pack_rolls_pack_size_check check (pack_size in (1,3,5,11));