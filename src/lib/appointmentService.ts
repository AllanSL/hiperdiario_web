import { supabase } from './supabase';
import type { ShiftType, Appointment } from './database.types';

const SHIFT_CAPACITY = 5; // Fixed capacity per shift

export class AppointmentService {
  /**
   * Checks availability for a specific professional, location, shift and date
   * Returns number of booked appointments and whether there's capacity
   */
  static async checkAvailability(
    cnes_id: string,
    specialty: string,
    shift: ShiftType,
    dateStr: string,
    professional_cns?: string | null
  ): Promise<{ booked: number; available: number; isFull: boolean }> {
    try {
      const startOfDay = new Date(dateStr).toISOString().split('T')[0] + 'T00:00:00Z';
      const endOfDay = new Date(dateStr).toISOString().split('T')[0] + 'T23:59:59Z';

      let query = supabase
        .from('appointments')
        .select('id')
        .eq('cnes_id', cnes_id)
        .eq('shift', shift)
        .gte('date_time', startOfDay)
        .lte('date_time', endOfDay)
        .in('status', ['scheduled', 'in_progress', 'attended']);

      if (professional_cns) {
        query = query.eq('professional_cns', professional_cns);
      } else {
        query = query.eq('specialty', specialty);
      }

      const { data, error } = await query;

      if (error) throw error;

      const booked = data?.length || 0;
      const available = Math.max(0, SHIFT_CAPACITY - booked);
      const isFull = booked >= SHIFT_CAPACITY;

      return { booked, available, isFull };
    } catch (error: unknown) {
      console.error('Erro ao verificar disponibilidade:', error);
      return { booked: 0, available: SHIFT_CAPACITY, isFull: false };
    }
  }

  /**
   * Get all appointments for a professional on a specific date
   */
  static async getAppointmentsForDay(
    cnes_id: string,
    dateStr: string,
    specialty?: string
  ): Promise<Appointment[]> {
    try {
      const startOfDay = new Date(dateStr).toISOString().split('T')[0] + 'T00:00:00Z';
      const endOfDay = new Date(dateStr).toISOString().split('T')[0] + 'T23:59:59Z';

      let query = supabase
        .from('appointments')
        .select('id, date_time, status, notes, cnes_id, specialty, professional_cns, patient_id, shift, patients(name, cpf), professionals(name, specialty)')
        .eq('cnes_id', cnes_id)
        .gte('date_time', startOfDay)
        .lte('date_time', endOfDay)
        .order('date_time', { ascending: true });

      if (specialty) {
        query = query.eq('specialty', specialty);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as Appointment[];
    } catch (error: unknown) {
      console.error('Erro ao buscar agendamentos do dia:', error);
      return [];
    }
  }

  /**
   * Create or update appointment with shift support
   */
  static async saveAppointment(
    appointmentData: Omit<Appointment, 'id'> & { id?: string },
    isUpdate: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        date_time: appointmentData.date_time,
        status: appointmentData.status || 'scheduled',
        notes: appointmentData.notes || '',
        cnes_id: appointmentData.cnes_id || 'Não informado',
        specialty: appointmentData.specialty || '',
        professional_cns: appointmentData.professional_cns || null,
        patient_id: appointmentData.patient_id,
        shift: appointmentData.shift || 'morning',
      };

      if (isUpdate && appointmentData.id) {
        const { error } = await supabase.from('appointments').update(payload).eq('id', appointmentData.id);
        if (error) throw error;
        return { success: true };
      } else {
        const { error } = await supabase.from('appointments').insert([payload]);
        if (error) throw error;
        return { success: true };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar agendamento';
      console.error('Erro ao salvar agendamento:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Delete appointment
   */
  static async deleteAppointment(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('appointments').delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao excluir agendamento';
      console.error('Erro ao excluir agendamento:', error);
      return { success: false, error: errorMessage };
    }
  }
}
