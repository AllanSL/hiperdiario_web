import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import { CnesService } from '../../lib/cnesService';

import { ArrowLeft, Users, ChevronDown, UserCheck, Search } from 'lucide-react';

type ProfessionalSummary = {
  cns: string;
  user_id?: string;
  name: string;
  specialty?: string;
  crm_crf?: string;
  role?: string;
};

type AppointmentSummary = {
  id: string;
  date_time: string;
  status?: string;
  professional_cns?: string;
  specialty?: string;
  patient_id?: string;
  cnes_id?: string;
  shift?: string;
  professionals?: {
    name: string;
    specialty: string;
  };
  patients?: {
    name: string;
    cpf: string;
  };
};




const getStatusLabel = (status?: string, dateTime?: string, shift?: string) => {
  const normalized = status?.toLowerCase() || '';

  // Lógica para marcar como 'Faltou' se o tempo expirou e ainda está apenas como 'Agendada'
  if (normalized === 'scheduled' || !normalized) {
    const now = new Date();
    const aptDate = dateTime ? new Date(dateTime) : null;

    if (aptDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const checkDate = new Date(aptDate);
      checkDate.setHours(0, 0, 0, 0);

      // Se a data da consulta já passou
      if (checkDate < today) {
        return { label: 'Faltou', classes: 'bg-red-100 text-red-800' };
      }

      // Se a consulta é hoje, verificamos o horário limite por turno
      if (checkDate.getTime() === today.getTime()) {
        const hours = now.getHours();
        if (shift === 'morning' && hours >= 13) {
          return { label: 'Faltou', classes: 'bg-red-100 text-red-800' };
        }
        if (shift === 'afternoon' && hours >= 17) {
          return { label: 'Faltou', classes: 'bg-red-100 text-red-800' };
        }
      }
    }
  }

  if (normalized.includes('attended') || normalized.includes('compareceu')) return { label: 'Atendido', classes: 'bg-green-100 text-green-800' };
  if (normalized.includes('missed') || normalized.includes('faltou')) return { label: 'Faltou', classes: 'bg-red-100 text-red-800' };
  if (normalized.includes('checked_in') || normalized.includes('fila')) return { label: 'Na Fila', classes: 'bg-blue-100 text-blue-800' };
  if (normalized.includes('in_progress')) return { label: 'Em Atendimento', classes: 'bg-amber-100 text-amber-800' };
  if (normalized.includes('cancel')) return { label: 'Cancelada', classes: 'bg-yellow-100 text-yellow-800' };
  return { label: 'Agendada', classes: 'bg-gray-100 text-gray-800' };
};

export default function RecepcionistaResumoUBS() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([]);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [selectedProfessionalCns, setSelectedProfessionalCns] = useState<string>('');
  const [isProfessionalDropdownOpen, setIsProfessionalDropdownOpen] = useState(false);
  const [unitName, setUnitName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotification();
  const professionalDropdownRef = useRef<HTMLDivElement | null>(null);

  const fetchResumo = useCallback(async () => {
    if (!profile?.cnes) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      const [professionalsResponse, appointmentsResponse] = await Promise.all([
        supabase
          .from('professionals')
          .select('cns, user_id, name, specialty, crm_crf, role')
          .eq('cnes', profile.cnes)
          .order('name', { ascending: true }),
        supabase
          .from('appointments')
          .select(`
            *,
            patients ( name, cpf ),
            professionals ( name, specialty )
          `)
          .eq('cnes_id', profile.cnes)
          .gte('date_time', startOfDay.toISOString())
          .lte('date_time', endOfDay.toISOString())
          .order('date_time', { ascending: true }),
      ]);

      if (professionalsResponse.error) throw professionalsResponse.error;
      if (appointmentsResponse.error) throw appointmentsResponse.error;

      // Filtro de ocupações de saúde
      const healthKeywords = ['MEDICO', 'MÉDICO', 'DENTISTA', 'PSICOLOGO', 'PSICÓLOGO', 'NUTRICIONISTA', 'PSIQUIATRA', 'GINECOLOGISTA', 'FISIOTERAPEUTA'];
      const isHealthProf = (specialty: string) => {
        const upper = specialty.toUpperCase();
        return healthKeywords.some(key => upper.includes(key));
      };

      const filteredProfs = (professionalsResponse.data || []).filter((p: any) => isHealthProf(p.specialty || ''));
      setProfessionals(filteredProfs as ProfessionalSummary[]);
      setAppointments((appointmentsResponse.data || []) as AppointmentSummary[]);
    } catch (err: any) {
      console.error('Erro ao carregar resumo do dia:', err);
      showNotification('error', err.message || 'Erro ao carregar dados da UBS.');
    } finally {
      setLoading(false);
    }
  }, [profile?.cnes, showNotification]);

  useEffect(() => {
    fetchResumo();
  }, [fetchResumo]);

  useEffect(() => {
    const fetchUnitInfo = async () => {
      if (!profile?.cnes) return;
      try {
        const { data } = await supabase
          .from('cnes_establishments')
          .select('name')
          .eq('cnes_id', profile.cnes)
          .maybeSingle();

        if (data?.name) {
          setUnitName(CnesService.formatCnesDisplayName(data.name));
        }
      } catch (err) {
        console.error('Erro ao buscar nome da unidade:', err);
      }
    };

    fetchUnitInfo();
  }, [profile?.cnes]);

  const handleCheckIn = async (aptId: string) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'checked_in',
          checked_in_at: new Date().toISOString()
        })
        .eq('id', aptId);

      if (error) throw error;
      showNotification('success', 'Check-in realizado com sucesso!');
      fetchResumo();
    } catch (err: any) {
      showNotification('error', 'Erro ao realizar check-in: ' + err.message);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!professionalDropdownRef.current) return;
      if (!professionalDropdownRef.current.contains(event.target as Node)) {
        setIsProfessionalDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedProfessional = professionals.find((prof) => prof.cns === selectedProfessionalCns);
  const filteredAppointments = useMemo(() => {
    if (!selectedProfessionalCns) return appointments;
    return appointments.filter(
      (appointment) =>
        appointment.professional_cns === selectedProfessionalCns,
    );
  }, [appointments, selectedProfessionalCns, selectedProfessional]);

  const totalConsultations = filteredAppointments.length;
  const attendedCount = filteredAppointments.filter((apt) => getStatusLabel(apt.status, apt.date_time, apt.shift).label === 'Atendido').length;
  const missedCount = filteredAppointments.filter((apt) => getStatusLabel(apt.status, apt.date_time, apt.shift).label === 'Faltou').length;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 [scrollbar-gutter:stable]">
      <nav className="bg-white shadow px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/recepcionista')} className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Resumo do Dia</h1>
            <p className="text-sm text-gray-500">Visão de funcionamento, consultas de hoje e profissionais da unidade.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
          <div className="text-center sm:text-right text-sm text-gray-500 flex flex-col">
            {unitName ? (
              <span className="font-semibold text-gray-700">{unitName} <span className="font-normal text-gray-400 ml-1">CNES {profile?.cnes}</span></span>
            ) : (
              profile?.cnes ? (
                <span className="font-semibold text-gray-700">UBS CNES <span className="font-normal text-gray-400 ml-1">{profile.cnes}</span></span>
              ) : 'Unidade não informada'
            )}
            <span className="text-xs font-medium text-blue-600">{profile?.name}</span>
          </div>
          <button onClick={fetchResumo} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-white hover:bg-blue-700 transition font-bold text-sm shadow-lg shadow-blue-100">
            <UserCheck size={18} /> Atualizar Resumo
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">


        <section className="grid gap-4 mb-6 sm:grid-cols-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-gray-600">Total de consultas</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{totalConsultations}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-gray-600">Compareceram</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{attendedCount}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-gray-600">Faltaram</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{missedCount}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[2.5fr_1fr]">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Consultas de hoje</h2>
                <p className="text-sm text-gray-500">Filtre por profissional para ver o resumo específico.</p>
              </div>
              <div ref={professionalDropdownRef} className="relative w-full max-w-md">
                <button
                  type="button"
                  onClick={() => setIsProfessionalDropdownOpen((open) => !open)}
                  className="flex w-full items-center justify-between rounded-full border border-gray-300 bg-white px-4 py-3 text-left text-sm shadow-sm transition hover:border-blue-400 focus:border-blue-500 focus:outline-none"
                >
                  <div className="min-w-0 pr-3 text-left">
                    {selectedProfessional ? (
                      <>
                        <p className="text-sm font-medium text-gray-900 leading-snug break-words">{selectedProfessional.name}</p>
                        <p className="text-xs text-gray-500 leading-tight break-words">{selectedProfessional.specialty || 'Sem especialidade'}</p>
                      </>
                    ) : (
                      <span className="text-sm text-gray-700">Todos os profissionais</span>
                    )}
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                </button>
                {isProfessionalDropdownOpen && (
                  <div className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-3xl border border-gray-200 bg-white shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProfessionalCns('');
                        setIsProfessionalDropdownOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <span className="font-medium">Todos os profissionais</span>
                      <span className="block text-xs text-gray-500">Remover filtro</span>
                    </button>
                    <div className="border-t border-gray-200" />
                    {professionals.map((professional) => (
                      <button
                        key={professional.cns}
                        type="button"
                        onClick={() => {
                          setSelectedProfessionalCns(professional.cns);
                          setIsProfessionalDropdownOpen(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <span className="font-medium">{professional.name}</span>
                        <span className="block text-xs text-gray-500">{professional.specialty || 'Sem especialidade'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Turno</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Profissional</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Paciente</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">Carregando consultas...</td>
                    </tr>
                  ) : filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">Nenhuma consulta encontrada para hoje.</td>
                    </tr>
                  ) : (
                    filteredAppointments.map((appointment) => {
                      const timeText = appointment.shift === 'morning' ? 'Manhã' : 'Tarde';
                      const status = getStatusLabel(appointment.status, appointment.date_time, appointment.shift);

                      return (
                        <tr key={appointment.id}>
                          <td className="px-4 py-4 text-sm text-gray-700">{timeText}</td>
                          <td className="px-4 py-4 text-sm text-gray-700">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900">
                                {appointment.professionals?.name || 'Não informado'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {appointment.professionals?.specialty || (appointment.specialty && appointment.specialty.length > 30 ? 'Consultar' : appointment.specialty)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-700">{appointment.patients?.name || 'Não informado'}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.classes}`}>{status.label}</span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            {(!appointment.status || appointment.status === 'scheduled') && (
                              <button
                                onClick={() => handleCheckIn(appointment.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
                              >
                                <UserCheck size={14} /> Check-in
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Users className="text-blue-500 h-6 w-6" />
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Profissionais da UBS</h2>
                <p className="text-sm text-gray-500">Especialidade dos profissionais vinculados.</p>
              </div>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-gray-500">Carregando profissionais...</div>
              ) : professionals.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-gray-500">Nenhum profissional encontrado.</div>
              ) : (
                professionals.map((professional) => (
                  <div key={professional.cns} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{professional.name}</p>
                        <p className="text-sm text-gray-500">{professional.specialty || 'Sem especialidade'}</p>
                      </div>
                    </div>
                    {/* Exibir o CRM ou CRF do profissional*/}
                    {/* <div className="mt-3 flex flex-col gap-1 text-sm text-gray-600"> */}
                    {/* <p>CRM/CRF: {professional.crm_crf || 'Não informado'}</p> */}
                    {/* </div> */}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

