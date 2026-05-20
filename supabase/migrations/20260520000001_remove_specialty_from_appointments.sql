-- Remove a coluna specialty da tabela appointments
ALTER TABLE public.appointments DROP COLUMN IF EXISTS specialty;
