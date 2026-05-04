// Database Types
export type ShiftType = 'morning' | 'afternoon';

export interface Appointment {
  id: string;
  date_time: string;
  status: string | null;
  notes?: string;
  location?: string;
  specialty?: string;
  professional_name?: string;
  patient_id?: string;
  shift?: ShiftType;
  patients?: Patient | Patient[];
}

export interface Patient {
  id: string;
  name: string;
  cpf: string;
}

export interface Professional {
  id: string;
  nome: string;
  especialidade?: string;
  cnes?: string;
}

export interface BlockedTime {
  id: string;
  date_time: string;
  location?: string;
  specialty?: string;
  professional_name?: string;
  shift?: ShiftType;
  reason?: string;
}

// Shift hours mapping
export const SHIFT_HOURS: Record<ShiftType, { hour: number; minute: number; label: string }> = {
  morning: { hour: 8, minute: 0, label: 'Manhã (08:00)' },
  afternoon: { hour: 13, minute: 0, label: 'Tarde (13:00)' },
};

// Calculate date_time from date and shift
export function calculateDateTimeFromShift(dateStr: string, shift: ShiftType): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const shiftTime = SHIFT_HOURS[shift];
  return new Date(year, month - 1, day, shiftTime.hour, shiftTime.minute, 0).toISOString();
}

// Get shift from hour
export function getShiftFromHour(hour: number): ShiftType {
  return hour < 12 ? 'morning' : 'afternoon';
}

// Get availability count for a specific professional, location, shift and date
export interface AvailabilityCheck {
  location: string;
  specialty: string;
  shift: ShiftType;
  date: string;
  maxCapacity?: number;
}
