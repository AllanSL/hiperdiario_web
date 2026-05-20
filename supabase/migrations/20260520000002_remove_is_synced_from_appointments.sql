-- Remove a coluna is_synced da tabela appointments
ALTER TABLE public.appointments DROP COLUMN IF EXISTS is_synced;
