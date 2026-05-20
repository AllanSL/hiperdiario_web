-- Habilita a extensão pg_cron no banco, caso não exista
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Remove o job antigo se existir (garante idempotência ao rodar a migration)
SELECT cron.unschedule('update-missed-appointments');

-- Cria o job que roda a cada hora (no minuto 0)
-- A lógica ajusta o fuso horário para 'America/Sao_Paulo' para bater com as 13h e 17h locais.
SELECT cron.schedule(
  'update-missed-appointments',
  '0 * * * *',
  $$
    UPDATE public.appointments
    SET status = 'missed'
    WHERE status = 'scheduled'
      AND (
        -- 1. Passou de hoje (no fuso horário do Brasil)
        ((date_time AT TIME ZONE 'America/Sao_Paulo')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) 
        OR 
        -- 2. É o dia de hoje, e é o turno da manhã e já passou das 13h (local)
        (
          (date_time AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date 
          AND shift = 'morning' 
          AND extract(hour from CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') >= 13
        ) 
        OR 
        -- 3. É o dia de hoje, e é o turno da tarde e já passou das 17h (local)
        (
          (date_time AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date 
          AND shift = 'afternoon' 
          AND extract(hour from CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') >= 17
        )
      );
  $$
);
