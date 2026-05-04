-- Add shift and location columns to appointments table
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS shift text NOT NULL DEFAULT 'morning';

-- Create index for performance on location, shift, date_time queries
CREATE INDEX IF NOT EXISTS idx_appointments_location_shift_date_time
  ON public.appointments(location, shift, date_time);
