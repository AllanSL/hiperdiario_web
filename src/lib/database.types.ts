// Database Types
export type ShiftType = 'morning' | 'afternoon';
export type AppointmentStatus = 'scheduled' | 'checked_in' | 'in_progress' | 'attended' | 'missed';

export interface Appointment {
  id: string;
  date_time: string;
  status: AppointmentStatus | string | null;
  notes?: string;
  cnes_id?: string;
  specialty?: string;
  professional_cns?: string;
  patient_id?: string;
  shift?: ShiftType;
  checked_in_at?: string | null;
  patients?: Patient | Patient[];
  professionals?: Professional;
}

export interface Patient {
  id: string;
  name: string;
  cpf: string;
  diseases?: string[];
  phone?: string;
}

export interface Professional {
  user_id?: string;
  name: string;
  specialty?: string;
  cnes?: string;
  cns: string;
  crm_crf?: string;
  role?: string;
}

export interface BlockedTime {
  id: string;
  date_time: string;
  cnes_id?: string;
  professional_cns?: string;
  shift?: ShiftType | 'all';
  reason?: string;
  professionals?: {
    name: string;
    specialty: string;
  };
}

export interface VitalSigns {
  systolic_bp?: number;      // Pressão sistólica (mmHg)
  diastolic_bp?: number;     // Pressão diastólica (mmHg)
  blood_glucose?: number;    // Glicemia (mg/dL)
  weight?: number;           // Peso (kg)
  heart_rate?: number;       // Frequência cardíaca (bpm)
  temperature?: number;      // Temperatura (°C)
}

export interface ClinicalNote {
  id: string;
  appointment_id: string;
  patient_id: string;
  professional_cns: string;
  content: string;
  attention_points: string[];
  vital_signs: VitalSigns;
  created_at: string;
  updated_at: string;
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

// Status labels and colors for UI
export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  scheduled: { label: 'Não chegou', color: 'text-gray-600', bgColor: 'bg-gray-100', borderColor: 'border-gray-400' },
  checked_in: { label: 'Na fila', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  in_progress: { label: 'Em atendimento', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  attended: { label: 'Atendido', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  missed: { label: 'Faltou', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
};

// Get availability count for a specific professional, location, shift and date
export interface AvailabilityCheck {
  cnes_id: string;
  specialty: string;
  shift: ShiftType;
  date: string;
  maxCapacity?: number;
}
