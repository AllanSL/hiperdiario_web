import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CnesService, type CnesHorario } from '../lib/cnesService';
import { ArrowLeft, Users, Clock3, ChevronDown } from 'lucide-react';

type ProfessionalSummary = {
  id: string;
  nome: string;
  especialidade?: string;
  crm_crf?: string;
  role?: string;
};

type AppointmentSummary = {
  id: string;
  date_time: string;
  status?: string;
  professional_name?: string;
  specialty?: string;
  patient_id?: string;
  location?: string;
};


const getTodayHorario = (horarios: CnesHorario[], date: Date = new Date()) => {
  const dias = {
    1: 'Segunda-Feira',
    2: 'Terça-Feira',
    3: 'Quarta-Feira',
    4: 'Quinta-Feira',
    5: 'Sexta-Feira',
  } as const;

  const diaSemana = dias[date.getDay() as keyof typeof dias];
  if (!diaSemana) return 'Sem expediente';

  const hoje = horarios.find((horario) => horario.diaSemana === diaSemana);
  if (!hoje) return 'Sem expediente';

  return `${diaSemana} ${hoje.hrInicioAtendimento} - ${hoje.hrFimAtendimento}`;
};

const getTodayHorarioLabel = (horarios: CnesHorario[]) => {
  const horario = getTodayHorario(horarios);
  return horario === 'Sem expediente' ? 'Funcionamento (Sem expediente)' : `Funcionamento (${horario})`;
};

const getStatusLabel = (status?: string) => {
  const normalized = status?.toLowerCase() || '';
  if (normalized.includes('attended') || normalized.includes('compareceu')) return { label: 'Compareceu', classes: 'bg-green-100 text-green-800' };
  if (normalized.includes('missed') || normalized.includes('faltou')) return { label: 'Faltou', classes: 'bg-red-100 text-red-800' };
  if (normalized.includes('cancel')) return { label: 'Cancelada', classes: 'bg-yellow-100 text-yellow-800' };
  return { label: status || 'Agendada', classes: 'bg-blue-100 text-blue-800' };
};

export default function RecepcionistaResumoUBS() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([]);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [horariosUbs, setHorariosUbs] = useState<CnesHorario[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [isProfessionalDropdownOpen, setIsProfessionalDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [horariosLoading, setHorariosLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const professionalDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchResumo = async () => {
      if (!profile?.cnes) {
        setNotification({ type: 'error', message: 'Unidade não está vinculada ao perfil.' });
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
            .from('profissionais')
            .select('id, nome, especialidade, crm_crf, role')
            .eq('cnes', profile.cnes)
            .order('nome', { ascending: true }),
          supabase
            .from('appointments')
            .select('*')
            .gte('date_time', startOfDay.toISOString())
            .lte('date_time', endOfDay.toISOString())
            .order('date_time', { ascending: true }),
        ]);

        if (professionalsResponse.error) throw professionalsResponse.error;
        if (appointmentsResponse.error) throw appointmentsResponse.error;

        setProfessionals((professionalsResponse.data || []) as ProfessionalSummary[]);
        setAppointments((appointmentsResponse.data || []) as AppointmentSummary[]);
      } catch (err: any) {
        console.error('Erro ao carregar resumo da UBS:', err);
        setNotification({ type: 'error', message: err.message || 'Erro ao carregar dados da UBS.' });
      } finally {
        setLoading(false);
      }
    };

    fetchResumo();
  }, [profile]);

  useEffect(() => {
    if (!profile?.ibge || !profile?.cnes) return;

    setHorariosLoading(true);
    CnesService.buscarHorariosFuncionamento(profile.ibge, profile.cnes)
      .then((data) => setHorariosUbs(data))
      .catch((err) => {
        console.error('Erro ao carregar horários da UBS:', err);
        setNotification({ type: 'error', message: 'Não foi possível carregar horários CNES.' });
      })
      .finally(() => setHorariosLoading(false));
  }, [profile?.ibge, profile?.cnes]);

  useEffect(() => {
    if (!notification) return;
    const timeout = window.setTimeout(() => setNotification(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notification]);

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

  const selectedProfessional = professionals.find((prof) => prof.id === selectedProfessionalId);
  const filteredAppointments = useMemo(() => {
    if (!selectedProfessionalId) return appointments;
    return appointments.filter(
      (appointment) =>
        appointment.professional_name === selectedProfessional?.nome ||
        appointment.specialty === selectedProfessional?.especialidade,
    );
  }, [appointments, selectedProfessionalId, selectedProfessional]);

  const totalConsultations = filteredAppointments.length;
  const attendedCount = filteredAppointments.filter((apt) => getStatusLabel(apt.status).label === 'Compareceu').length;
  const missedCount = filteredAppointments.filter((apt) => getStatusLabel(apt.status).label === 'Faltou').length;

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/recepcionista')} className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Resumo da UBS</h1>
            <p className="text-sm text-gray-500">Visão de funcionamento, consultas de hoje e profissionais da unidade.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm text-gray-700">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-blue-700 font-semibold">
            <Clock3 className="h-4 w-4" />
            {horariosLoading ? 'Carregando...' : getTodayHorarioLabel(horariosUbs)}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {notification && (
          <div className={`mb-6 rounded-lg border px-4 py-3 text-sm shadow ${notification.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : notification.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            {notification.message}
          </div>
        )}

        <section className="grid gap-4 mb-6 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-blue-50 p-4">
            <p className="text-sm text-gray-600">Total de consultas</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{totalConsultations}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-green-50 p-4">
            <p className="text-sm text-gray-600">Compareceram</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{attendedCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-red-50 p-4">
            <p className="text-sm text-gray-600">Faltaram</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{missedCount}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
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
                        <p className="text-sm font-medium text-gray-900 leading-snug break-words">{selectedProfessional.nome}</p>
                        <p className="text-xs text-gray-500 leading-tight break-words">{selectedProfessional.especialidade || 'Sem especialidade'}</p>
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
                        setSelectedProfessionalId('');
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
                        key={professional.id}
                        type="button"
                        onClick={() => {
                          setSelectedProfessionalId(professional.id);
                          setIsProfessionalDropdownOpen(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <span className="font-medium">{professional.nome}</span>
                        <span className="block text-xs text-gray-500">{professional.especialidade || 'Sem especialidade'}</span>
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
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Horário</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Profissional</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Paciente</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
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
                      const appointmentDate = new Date(appointment.date_time);
                      const timeText = appointmentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const status = getStatusLabel(appointment.status);

                      return (
                        <tr key={appointment.id}>
                          <td className="px-4 py-4 text-sm text-gray-700">{timeText}</td>
                          <td className="px-4 py-4 text-sm text-gray-700">{appointment.professional_name || appointment.specialty || 'Não informado'}</td>
                          <td className="px-4 py-4 text-sm text-gray-700">{appointment.patient_id || 'Não informado'}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.classes}`}>{status.label}</span>
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
                <p className="text-sm text-gray-500">Especialidade e CRM/CRF dos profissionais vinculados.</p>
              </div>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-gray-500">Carregando profissionais...</div>
              ) : professionals.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-gray-500">Nenhum profissional encontrado.</div>
              ) : (
                professionals.map((professional) => (
                  <div key={professional.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{professional.nome}</p>
                        <p className="text-sm text-gray-500">{professional.especialidade || 'Sem especialidade'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-1 text-sm text-gray-600">
                      <p>CRM/CRF: {professional.crm_crf || 'Não informado'}</p>
                    </div>
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
