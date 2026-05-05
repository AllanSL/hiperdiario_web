-- Migration: Fluxo de Atendimento (Check-in + Notas Clínicas)
-- Executar no Supabase SQL Editor

-- 1. Adicionar campo checked_in_at na tabela appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_at timestamptz DEFAULT NULL;

-- 2. Criar tabela clinical_notes (com vital_signs para dados quantificáveis)
CREATE TABLE IF NOT EXISTS clinical_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id uuid NOT NULL REFERENCES patients(id),
    professional_cns text NOT NULL,
    content text DEFAULT '',
    attention_points text[] DEFAULT '{}',
    vital_signs jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Apenas 1 nota clínica por atendimento
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_notes_appointment ON clinical_notes(appointment_id);

-- RLS
ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage clinical_notes') THEN
        CREATE POLICY "Authenticated users can manage clinical_notes"
            ON clinical_notes FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;
