import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { CnesService, type CnesHorario } from '../../lib/cnesService';
import { ArrowLeft, Users, Clock3, ChevronDown, UserCheck, CheckCircle, XCircle, Info, X } from 'lucide-react';

type ProfessionalSummary = {
  cns: string;
  user_id?: string;
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
  professional_cns?: string;
  specialty?: string;
  patient_id?: string;
  cnes_id?: string;
  shift?: string;
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
  const [horariosUbs, setHorariosUbs] = useState<CnesHorario[]>([]);
  const [selectedProfessionalCns, setSelectedProfessionalCns] = useState<string>('');
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
            .from('professionals')
            .select('cns, user_id, nome, especialidade, crm_crf, role')
            .eq('cnes', profile.cnes)
            .order('nome', { ascending: true }),
          supabase
            .from('appointments')
            .select(`
              *,
              patients ( name, cpf ),
              professionals ( nome, especialidade )
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
        const isHealthProf = (especialidade: string) => {
          const upper = especialidade.toUpperCase();
          return healthKeywords.some(key => upper.includes(key));
        };

        const filteredProfs = (professionalsResponse.data || []).filter((p: any) => isHealthProf(p.especialidade || ''));
        setProfessionals(filteredProfs as ProfessionalSummary[]);
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

  const fetchResumo = async () => {
    if (!profile?.cnes) return;
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *, 
          patients ( name, cpf ),
          professionals ( nome, especialidade )
        `)
        .eq('cnes_id', profile.cnes)
        .gte('date_time', startOfDay.toISOString())
        .lte('date_time', endOfDay.toISOString())
        .order('date_time', { ascending: true });

      if (error) throw error;
      setAppointments((data || []) as AppointmentSummary[]);
    } catch (err: any) {
      console.error('Erro ao recarregar consultas:', err);
    }
  };

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
      setNotification({ type: 'success', message: 'Check-in realizado com sucesso!' });
      fetchResumo();
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Erro ao realizar check-in: ' + err.message });
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
        appointment.professional_name === selectedProfessional?.nome ||
        appointment.professional_cns === selectedProfessionalCns,
    );
  }, [appointments, selectedProfessionalCns, selectedProfessional]);

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
          <div className="fixed top-24 right-6 z-50 animate-in slide-in-from-right-8 duration-300">
            <div className={`rounded-2xl border-2 px-6 py-4 shadow-2xl flex items-center gap-3 min-w-[300px] ${
              notification.type === 'success' ? 'bg-green-600 border-green-500 text-white' : 
              notification.type === 'error' ? 'bg-red-600 border-red-500 text-white' : 
              'bg-blue-600 border-blue-500 text-white'
            }`}>
              {notification.type === 'success' && <CheckCircle size={24} />}
              {notification.type === 'error' && <XCircle size={24} />}
              {notification.type === 'info' && <Info size={24} />}
              
              <div className="flex-1">
                <p className="font-bold text-sm leading-tight">{notification.message}</p>
              </div>

              <button 
                onClick={() => setNotification(null)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
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
                      const status = getStatusLabel(appointment.status);

                      return (
                        <tr key={appointment.id}>
                          <td className="px-4 py-4 text-sm text-gray-700">{timeText}</td>
                          <td className="px-4 py-4 text-sm text-gray-700">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900">
                                {(appointment as any).professionals?.nome || appointment.professional_name || 'Não informado'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {(appointment as any).professionals?.especialidade || (appointment.specialty && appointment.specialty.length > 30 ? 'Consultar' : appointment.specialty)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-700">{(appointment as any).patients?.name || 'Não informado'}</td>
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
                  <div key={professional.cns} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
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

