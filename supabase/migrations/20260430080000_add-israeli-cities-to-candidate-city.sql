-- Expand candidate_city enum with all major Israeli cities.
-- Ashkelon and Kiryat Gat already exist; IF NOT EXISTS makes this idempotent.
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Ashdod';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Tel Aviv';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Jerusalem';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Haifa';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Beer Sheva';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Netanya';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Rishon LeZion';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Petah Tikva';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Holon';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Bnei Brak';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Ramat Gan';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Bat Yam';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Rehovot';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Herzliya';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Kfar Saba';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Modiin';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Eilat';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Tiberias';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Nazareth';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Acre';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Lod';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Ramla';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Afula';
ALTER TYPE public.candidate_city ADD VALUE IF NOT EXISTS 'Nahariya';
