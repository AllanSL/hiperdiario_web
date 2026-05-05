import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Plus, Trash2, Ban, Search, Edit, ChevronLeft, ChevronRight, MapPin, Calendar, Users, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { calculateDateTimeFromShift, getShiftFromHour, type ShiftType } from '../../lib/database.types';
import { CnesService } from '../../lib/cnesService';
import { AppointmentService } from '../../lib/appointmentService';

type Professional = {
  user_id?: string;
  nome: string;
  especialidade: string;
  cns: string;
};

type Patient = {
  id: string;
  name: string;
  cpf: string;
};

type Appointment = {
  id: string;
  date_time: string;
  status: string | null;
  notes?: string;
  location?: string;
  specialty?: string;
  professional_name?: string;
  professional_cns?: string;
  patient_id?: string;
  shift?: string;
  patients?: Patient | Patient[];
};

type BlockedTime = {
  id: string;
  date_time: string;
  location?: string;
  specialty?: string;
  professional_name?: string;
  professional_cns?: string;
  reason?: string;
};

const formatCPF = (cpf: string) => {
  if (!cpf) return '';
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
  if (cleaned.length <= 9) return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
  return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9, 11)}`;
};

const formatCapitalize = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => {
    if (word.length <= 2 && ['de', 'da', 'do', 'dos', 'das', 'e'].includes(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
};

export default function RecepcionistaAgenda() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [loading, setLoading] = useState(true);
  const [unitName, setUnitName] = useState<string>('');
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [miniCalendarMonth, setMiniCalendarMonth] = useState(new Date());
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    danger?: boolean;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedProfessionalCns, setSelectedProfessionalCns] = useState('');
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  const [appointmentForm, setAppointmentForm] = useState<{
    professionalCns: string;
    date: string;
    shift: ShiftType;
    location: string;
    notes: string;
    status: string;
  }>({
    professionalCns: '',
    date: new Date().toISOString().split('T')[0],
    shift: 'morning',
    location: profile?.cnes || '',
    notes: '',
    status: 'scheduled',
  });
  const [creatingAppointment, setCreatingAppointment] = useState(false);
  const [blockingDate, setBlockingDate] = useState(false);
  const [blockReason, setBlockReason] = useState('Bloqueio de agenda');


  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const profResult = await supabase
        .from('professionals')
        .select('user_id, nome, especialidade, cns')
        .eq('cnes', profile?.cnes)
        .order('nome', { ascending: true });

      if (profResult.error) throw profResult.error;

      const aptResult = await supabase
        .from('appointments')
        .select(`
          *,
          patients ( name, cpf )
        `)
        .eq('cnes_id', profile?.cnes)
        .gte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString())
        .lte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString())
        .order('date_time', { ascending: true });

      const blockResult = await supabase
        .from('blocked_times')
        .select('*')
        .eq('cnes_id', profile?.cnes)
        .gte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString())
        .lte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString())
        .order('date_time', { ascending: true });

      const cnesProfs = await (profile?.ibge && profile?.cnes
        ? CnesService.buscarProfissionais(parseInt(profile.ibge), parseInt(profile.cnes))
        : Promise.resolve([]));

      setAppointments((aptResult.data || []) as Appointment[]);
      setBlockedTimes((blockResult.data || []) as BlockedTime[]);

      // Filtro de ocupações de saúde
      const healthKeywords = ['MEDICO', 'MÉDICO', 'DENTISTA', 'PSICOLOGO', 'PSICÓLOGO', 'NUTRICIONISTA', 'PSIQUIATRA', 'GINECOLOGISTA', 'FISIOTERAPEUTA'];
      const isHealthProf = (especialidade: string) => {
        const upper = especialidade.toUpperCase();
        return healthKeywords.some(key => upper.includes(key));
      };

      // Mescla profissionais do banco com profissionais do CNES usando CNS como chave
      const dbProfs = profResult.data || [];
      const mergedProfs: Professional[] = cnesProfs
        .filter(cp => isHealthProf(cp.especialidade))
        .map(cp => {
          const matchingDb = dbProfs.find(p => p.cns === cp.cns);
          return {
            user_id: matchingDb?.user_id,
            nome: cp.nome,
            especialidade: cp.especialidade,
            cns: cp.cns
          };
        });

      // Adiciona profissionais do banco que não estão no CNES (também filtrando por especialidade)
      dbProfs.forEach(dp => {
        if (dp.cns && !mergedProfs.find(mp => mp.cns === dp.cns)) {
          if (isHealthProf(dp.especialidade || '')) {
            mergedProfs.push({
              user_id: dp.user_id,
              nome: dp.nome,
              especialidade: dp.especialidade || 'Outros',
              cns: dp.cns
            });
          }
        }
      });

      setProfessionals(mergedProfs);
    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao carregar dados da agenda.' });
    } finally {
      setLoading(false);
    }
  }, [profile, currentMonth]);


  useEffect(() => {
    if (profile?.cnes) {
      fetchData();
    }
  }, [profile, currentMonth, fetchData]);

  useEffect(() => {
    if (!notification) return;
    const timeout = window.setTimeout(() => setNotification(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notification]);

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




  const selectedProfessional = useMemo(() => {
    if (!selectedProfessionalCns) return null;
    return professionals.find((prof) => prof.cns === selectedProfessionalCns) || null;
  }, [professionals, selectedProfessionalCns]);

  const specialties = useMemo(() => {
    const s = new Set<string>();
    professionals.forEach(p => {
      if (p.especialidade) s.add(p.especialidade);
    });
    return Array.from(s).sort();
  }, [professionals]);

  const filteredProfessionalsBySpecialty = useMemo(() => {
    if (!selectedSpecialty) return professionals;
    return professionals.filter(p => p.especialidade === selectedSpecialty);
  }, [professionals, selectedSpecialty]);


  useEffect(() => {
    if (selectedProfessional && !editingAppointment) {
      setAppointmentForm((prev) => ({ ...prev, professionalCns: selectedProfessional.cns }));
    }
  }, [selectedProfessional, editingAppointment]);

  const handleEditAppointment = (apt: Appointment) => {
    const patient = getPatientRecord(apt.patients);
    const aptDate = new Date(apt.date_time);
    const shift = (apt as any).shift || getShiftFromHour(aptDate.getHours());

    setEditingAppointment(apt);
    setSelectedPatient(patient);
    setShowAppointmentModal(true);
    setActiveDropdown(null);
    setMiniCalendarMonth(aptDate);

    const profCns = apt.professional_cns || '';
    setSelectedProfessionalCns(profCns);

    setAppointmentForm({
      professionalCns: profCns,
      date: aptDate.toISOString().split('T')[0],
      shift: shift as ShiftType,
      location: apt.location || profile?.cnes || '',
      notes: apt.notes || '',
      status: apt.status || 'scheduled',
    });
  };

  const handleCancelEdit = () => {
    setEditingAppointment(null);
    setSelectedPatient(null);
    setShowAppointmentModal(false);
    setActiveDropdown(null);
    setMiniCalendarMonth(selectedDate);
    setAppointmentForm((prev) => ({
      ...prev,
      date: `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`,
      shift: 'morning',
      location: profile?.cnes || '',
      notes: '',
      status: 'scheduled',
    }));
  };

  const filteredAppointments = useMemo(() => {
    if (!selectedProfessionalCns) return appointments;
    return appointments.filter((apt) => {
      if (apt.professional_cns) return apt.professional_cns === selectedProfessionalCns;
      // Fallback para nome/especialidade em registros antigos
      const [nome] = (selectedProfessional?.nome || '').split(' ');
      return apt.professional_name?.includes(nome) && apt.specialty?.includes(selectedProfessional?.especialidade || '');
    });
  }, [appointments, selectedProfessionalCns, selectedProfessional]);

  const filteredBlockedTimes = useMemo(() => {
    if (!selectedProfessionalCns) return blockedTimes;
    return blockedTimes.filter((blk) => {
      if (blk.professional_cns) return blk.professional_cns === selectedProfessionalCns;
      return blk.professional_name === selectedProfessional?.nome;
    });
  }, [blockedTimes, selectedProfessionalCns, selectedProfessional]);

  const selectedDateAppointments = useMemo(() => {
    return filteredAppointments.filter((apt) => {
      const aptDate = new Date(apt.date_time);
      return (
        aptDate.getDate() === selectedDate.getDate() &&
        aptDate.getMonth() === selectedDate.getMonth() &&
        aptDate.getFullYear() === selectedDate.getFullYear()
      );
    });
  }, [filteredAppointments, selectedDate]);

  const selectedDateBlocks = useMemo(() => {
    return filteredBlockedTimes.filter((blk) => {
      const blkDate = new Date(blk.date_time);
      return (
        blkDate.getDate() === selectedDate.getDate() &&
        blkDate.getMonth() === selectedDate.getMonth() &&
        blkDate.getFullYear() === selectedDate.getFullYear()
      );
    });
  }, [filteredBlockedTimes, selectedDate]);

  const getPatientRecord = (patients?: Patient | Patient[] | null) => {
    if (!patients) return null;
    return Array.isArray(patients) ? patients[0] : patients;
  };

  const handleSearchPatient = async () => {
    const cpfClean = patientSearch.replace(/\D/g, '');
    if (!cpfClean || cpfClean.length < 8) {
      setNotification({ type: 'error', message: 'Informe um CPF válido para buscar o paciente.' });
      return;
    }
    setPatientLoading(true);
    try {
      const { data, error } = await supabase.from('patients').select('id, name, cpf').eq('cpf', cpfClean).single();
      if (error || !data) {
        setNotification({ type: 'error', message: 'Paciente não encontrado.' });
        setSelectedPatient(null);
        return;
      }
      setSelectedPatient(data as Patient);
    } catch (err) {
      console.error('Erro ao buscar paciente:', err);
      setNotification({ type: 'error', message: 'Erro ao buscar paciente.' });
    } finally {
      setPatientLoading(false);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      setNotification({ type: 'error', message: 'Selecione um paciente válido antes de agendar.' });
      return;
    }
    if (!selectedProfessionalCns) {
      setNotification({ type: 'error', message: 'Selecione um profissional no filtro do calendário.' });
      return;
    }
    const professional = selectedProfessional;
    const dateTime = calculateDateTimeFromShift(appointmentForm.date, appointmentForm.shift);
    
    try {
      setCreatingAppointment(true);

      // Verificação de capacidade (Limite de 5 por turno)
      if (!editingAppointment) {
        const availability = await AppointmentService.checkAvailability(
          profile?.cnes || '',
          professional?.especialidade || '',
          appointmentForm.shift,
          appointmentForm.date,
          professional?.cns
        );

        if (availability.isFull) {
          setNotification({ 
            type: 'error', 
            message: `Capacidade máxima atingida para o turno da ${appointmentForm.shift === 'morning' ? 'manhã' : 'tarde'} (${availability.booked}/5).` 
          });
          setCreatingAppointment(false);
          return;
        }
      }
      const payload: any = {
        date_time: dateTime,
        status: appointmentForm.status,
        notes: appointmentForm.notes,
        cnes_id: profile?.cnes || '',
        specialty: professional ? `${professional.especialidade} - ${professional.nome}` : '',
        professional_name: professional?.nome || '',
        professional_cns: professional?.cns || null,
        patient_id: selectedPatient.id,
        shift: appointmentForm.shift,
      };

      if (editingAppointment) {
        const { error } = await supabase.from('appointments').update(payload).eq('id', editingAppointment.id);
        if (error) throw error;
        setNotification({ type: 'success', message: 'Consulta atualizada com sucesso.' });
        setEditingAppointment(null);
      } else {
        const { error } = await supabase.from('appointments').insert([payload]);
        if (error) throw error;
        setNotification({ type: 'success', message: 'Consulta agendada com sucesso.' });
      }

      setPatientSearch('');
      fetchData();
    } catch (err: any) {
      console.error('Erro ao agendar consulta:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar consulta.' });
    } finally {
      setCreatingAppointment(false);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    setConfirmModal({
      show: true,
      title: 'Excluir Consulta',
      message: 'Tem certeza que deseja excluir esta consulta? Esta ação não pode ser desfeita.',
      danger: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('appointments').delete().eq('id', id);
          if (error) throw error;
          setNotification({ type: 'success', message: 'Consulta excluída.' });
          fetchData();
        } catch (err: any) {
          console.error('Erro ao excluir consulta:', err);
          setNotification({ type: 'error', message: err.message || 'Erro ao excluir consulta.' });
        }
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  const handleCheckIn = async (aptId: string) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'checked_in', checked_in_at: new Date().toISOString() })
        .eq('id', aptId);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Check-in realizado! Paciente adicionado à fila.' });
      fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Erro ao fazer check-in: ' + err.message });
    }
  };

  const handleToggleBlock = async () => {
    const isUnitBlock = !selectedProfessionalCns;
    const currentBlocks = isUnitBlock
      ? selectedDateBlocks.filter(blk => !blk.professional_cns && blk.professional_name === 'TODOS')
      : selectedDateBlocks.filter(blk => {
        if (blk.professional_cns) return blk.professional_cns === selectedProfessionalCns;
        return blk.professional_name === selectedProfessional?.nome;
      });

    const alreadyBlocked = currentBlocks.length > 0;

    const hasAppointments = isUnitBlock
      ? selectedDateAppointments.length > 0
      : selectedDateAppointments.some((apt) => {
        if (apt.professional_cns) return apt.professional_cns === selectedProfessionalCns;
        return apt.professional_name === selectedProfessional?.nome;
      });

    const confirmBlock = async () => {
      try {
        setBlockingDate(true);
        const block = {
          date_time: new Date(`${selectedDate.toISOString().split('T')[0]}T00:00:00`).toISOString(),
          professional_name: isUnitBlock ? 'TODOS' : selectedProfessional?.nome || '',
          professional_cns: isUnitBlock ? null : selectedProfessional?.cns || null,
          specialty: isUnitBlock ? 'TODOS' : selectedProfessional?.especialidade || '',
          location: profile?.cnes || '',
          reason: blockReason || (isUnitBlock ? 'Bloqueio de unidade' : `Bloqueio de agenda`),
        };
        const { error } = await supabase.from('blocked_times').insert([block]);
        if (error) throw error;
        setNotification({ type: 'success', message: `Data bloqueada para ${isUnitBlock ? 'todos os profissionais da unidade' : selectedProfessional?.nome}.` });
        setBlockReason('');
        fetchData();
      } catch (err: any) {
        console.error('Erro ao bloquear dia:', err);
        setNotification({ type: 'error', message: err.message || 'Erro ao bloquear dia.' });
      } finally {
        setBlockingDate(false);
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    };

    if (alreadyBlocked) {
      setConfirmModal({
        show: true,
        title: 'Liberar Bloqueio',
        message: `Deseja liberar o bloqueio desta data para ${isUnitBlock ? 'toda a unidade' : selectedProfessional?.nome}?`,
        onConfirm: async () => {
          try {
            const ids = currentBlocks.map((blk) => blk.id);
            const { error } = await supabase.from('blocked_times').delete().in('id', ids);
            if (error) throw error;
            setNotification({ type: 'success', message: 'Bloqueio liberado com sucesso.' });
            fetchData();
          } catch (err: any) {
            console.error('Erro ao desbloquear dia:', err);
            setNotification({ type: 'error', message: err.message || 'Erro ao desbloquear dia.' });
          }
          setConfirmModal(prev => ({ ...prev, show: false }));
        }
      });
      return;
    }

    setConfirmModal({
      show: true,
      title: 'Confirmar Bloqueio',
      message: hasAppointments
        ? `Existem ${selectedDateAppointments.length} consultas agendadas. O bloqueio impedirá NOVAS marcações, mas as existentes permanecerão. Deseja continuar?`
        : `Deseja bloquear a agenda para ${isUnitBlock ? 'toda a unidade' : selectedProfessional?.nome} nesta data?`,
      danger: hasAppointments,
      onConfirm: confirmBlock
    });
  };

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const blanksArray = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthName = currentMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/recepcionista')} className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Agenda da Recepção</h1>
            <p className="text-sm text-gray-500">Visualize todas as consultas da unidade e gerencie bloqueios.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          <div className="text-right text-sm text-gray-500">
            {unitName ? (
              <span className="font-semibold text-gray-700">{unitName} <span className="font-normal text-gray-400 ml-1">CNES {profile?.cnes}</span></span>
            ) : (
              profile?.cnes ? `UBS CNES ${profile.cnes}` : 'Unidade não informada'
            )}
          </div>
          <button onClick={fetchData} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition">
            <Search size={16} /> Atualizar
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          </div>
        ) : (
          <>

            {(() => {
              const isUnitBlock = !selectedProfessionalCns;
              const currentBlocks = selectedDateBlocks.filter(blk => {
                if (isUnitBlock) return blk.professional_name === 'TODOS';
                if (blk.professional_cns) return blk.professional_cns === selectedProfessionalCns;
                return blk.professional_name === selectedProfessional?.nome;
              });
              const alreadyBlocked = currentBlocks.length > 0;

              const appointmentsToCheck = isUnitBlock
                ? selectedDateAppointments
                : selectedDateAppointments.filter(a => a.professional_cns === selectedProfessionalCns || a.professional_name === selectedProfessional?.nome);

              return (
                <section className="bg-white shadow rounded-lg p-6 mb-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        <Ban className="text-red-600" size={20} />
                        {isUnitBlock ? 'Bloquear Toda a Unidade' : `Bloquear Agenda: ${formatCapitalize(selectedProfessional?.nome || '')}`}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {isUnitBlock
                          ? 'Impede agendamentos para TODOS os profissionais nesta data.'
                          : `Impede novos agendamentos para o profissional selecionado em ${selectedDate.toLocaleDateString('pt-BR')}.`}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-end gap-3 w-full sm:w-auto">
                      <div className="w-full sm:w-64">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Motivo do bloqueio</label>
                        <input
                          type="text"
                          value={blockReason}
                          onChange={(e) => setBlockReason(e.target.value)}
                          className="block w-full rounded-md border border-gray-300 shadow-sm p-2 text-sm focus:border-red-500 focus:ring-red-500"
                          placeholder={isUnitBlock ? "Ex: Reunião de equipe" : "Ex: Férias, Atestado"}
                        />
                      </div>

                      <div className="w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={handleToggleBlock}
                          disabled={blockingDate}
                          className={`w-full sm:w-auto inline-flex justify-center items-center gap-2 rounded-md px-6 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${alreadyBlocked ? 'bg-gray-600 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-700'}`}
                        >
                          {blockingDate ? 'Processando...' : (alreadyBlocked ? 'Desbloquear Data' : 'Confirmar Bloqueio')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {appointmentsToCheck.length > 0 && !alreadyBlocked && (
                    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-center gap-3">
                      <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                        <Plus className="rotate-45" size={16} />
                      </div>
                      <span>
                        Atenção: Existem <strong>{appointmentsToCheck.length} consultas</strong> já agendadas para este filtro.
                        O bloqueio impedirá novas marcações, mas as existentes permanecerão visíveis.
                      </span>
                    </div>
                  )}
                </section>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="flex flex-col gap-6 lg:col-span-2">

                <section className="bg-white shadow rounded-lg p-4 h-fit">
                  <div className="flex flex-col gap-1 mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">Calendário da unidade</h2>
                    </div>
                    <div className="flex flex-col gap-1 w-full">
                      <div className="relative">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Especialidade</label>
                        <button
                          type="button"
                          onClick={() => setActiveDropdown(activeDropdown === 'specialty' ? null : 'specialty')}
                          className={`flex items-center justify-between w-full rounded-xl border shadow-sm p-3 transition text-left bg-white ${activeDropdown === 'specialty' ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-300'}`}
                        >
                          <span className="text-base font-medium text-gray-800">
                            {selectedSpecialty ? formatCapitalize(selectedSpecialty) : 'Todas as especialidades'}
                          </span>
                          <ChevronLeft size={18} className={`text-gray-400 transition-transform duration-200 ${activeDropdown === 'specialty' ? 'rotate-90' : '-rotate-90'}`} />
                        </button>

                        {activeDropdown === 'specialty' && (
                          <>
                            <div className="fixed inset-0 z-[55]" onClick={() => setActiveDropdown(null)} />
                            <div className="absolute top-full left-0 mt-2 z-[60] bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden w-full animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => { setSelectedSpecialty(''); setSelectedProfessionalCns(''); setActiveDropdown(null); }}
                                className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition ${!selectedSpecialty ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                              >
                                Todas as especialidades
                              </button>
                              {specialties.map((esp, idx) => (
                                <button
                                  key={esp}
                                  type="button"
                                  onClick={() => { setSelectedSpecialty(esp); setSelectedProfessionalCns(''); setActiveDropdown(null); }}
                                  className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition border-t border-gray-100 ${selectedSpecialty === esp ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                >
                                  {formatCapitalize(esp)}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="relative">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Profissional</label>
                        <button
                          type="button"
                          onClick={() => setActiveDropdown(activeDropdown === 'professional' ? null : 'professional')}
                          className={`flex items-center justify-between w-full rounded-xl border shadow-sm p-3 transition text-left bg-white ${activeDropdown === 'professional' ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-300'}`}
                        >
                          <span className="text-base font-medium text-gray-800">
                            {selectedProfessionalCns ? formatCapitalize(professionals.find(p => p.cns === selectedProfessionalCns)?.nome || '') : 'Nenhum profissional'}
                          </span>
                          <ChevronLeft size={18} className={`text-gray-400 transition-transform duration-200 ${activeDropdown === 'professional' ? 'rotate-90' : '-rotate-90'}`} />
                        </button>

                        {activeDropdown === 'professional' && (
                          <>
                            <div className="fixed inset-0 z-[55]" onClick={() => setActiveDropdown(null)} />
                            <div className="absolute top-full left-0 mt-2 z-[60] bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden w-full animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => { setSelectedProfessionalCns(''); setActiveDropdown(null); }}
                                className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition ${!selectedProfessionalCns ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                              >
                                Nenhum profissional
                              </button>
                              {filteredProfessionalsBySpecialty.map((prof, idx) => (
                                <button
                                  key={prof.cns}
                                  type="button"
                                  onClick={() => { setSelectedProfessionalCns(prof.cns); setActiveDropdown(null); }}
                                  className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition border-t border-gray-100 ${selectedProfessionalCns === prof.cns ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                >
                                  {formatCapitalize(prof.nome)}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <button
                      type="button"
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                      className="p-2 hover:bg-gray-100 rounded-full"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <h2 className="text-lg font-semibold text-gray-800 first-letter:capitalize">{monthName}</h2>
                    <button
                      type="button"
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                      className="p-2 hover:bg-gray-100 rounded-full"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium text-gray-500 mb-2">
                    <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {blanksArray.map((blank) => <div key={`blank-${blank}`} className="p-2" />)}
                    {daysArray.map((day) => {
                      const currentDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                      const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;

                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isPastDate = currentDate < today;

                      const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth.getMonth() && selectedDate.getFullYear() === currentMonth.getFullYear();
                      const appointmentsCount = filteredAppointments.filter((apt) => {
                        const aptDate = new Date(apt.date_time);
                        return aptDate.getDate() === day && aptDate.getMonth() === currentMonth.getMonth() && aptDate.getFullYear() === currentMonth.getFullYear();
                      }).length;
                      const blocksCount = filteredBlockedTimes.filter((blk) => {
                        const blkDate = new Date(blk.date_time);
                        return blkDate.getDate() === day && blkDate.getMonth() === currentMonth.getMonth() && blkDate.getFullYear() === currentMonth.getFullYear();
                      }).length;

                      const isUnavailable = isWeekend;

                      return (
                        <div
                          key={day}
                          onClick={() => {
                            if (!isUnavailable) {
                              setSelectedDate(currentDate);
                            }
                          }}
                          className={`p-2 flex flex-col items-center justify-center rounded-lg transition-colors aspect-square text-sm
                            ${isUnavailable ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'cursor-pointer'}
                            ${isSelected && !isUnavailable ? 'bg-green-600 text-white font-bold shadow-md' : (!isUnavailable ? (isPastDate ? 'text-gray-400 hover:bg-gray-100' : 'text-gray-700 hover:bg-green-50') : 'text-gray-400')}
                        `}
                        >
                          <span>{day}</span>
                          <div className="flex gap-1 mt-1">
                            {appointmentsCount > 0 && <div className={`h-1.5 w-1.5 rounded-full ${isSelected && !isUnavailable ? 'bg-white' : 'bg-green-500'}`} />}
                            {blocksCount > 0 && <div className={`h-1.5 w-1.5 rounded-full ${isSelected && !isUnavailable ? 'bg-red-200' : 'bg-red-500'}`} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

              </div>

              <aside className="space-y-6 lg:col-span-3">
                {selectedProfessionalCns ? (() => {
                  const profApts = selectedDateAppointments.filter(a => {
                    if (a.professional_cns) return a.professional_cns === selectedProfessionalCns;
                    return a.professional_name === selectedProfessional?.nome;
                  });
                  const morningApts = profApts.filter(a => a.shift === 'morning' || (!a.shift && new Date(a.date_time).getHours() < 12));
                  const afternoonApts = profApts.filter(a => a.shift === 'afternoon' || (!a.shift && new Date(a.date_time).getHours() >= 12));
                  const maxCapacity = 5;

                  return (
                    <>
                      <section className="bg-white shadow rounded-lg p-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                          <div>
                            <h2 className="text-xl font-bold text-gray-800">{selectedProfessional?.nome}</h2>
                            <p className="text-sm text-gray-500">{selectedProfessional?.especialidade || 'Clínico Geral'}</p>
                            <p className="text-gray-600 mt-1 font-medium">{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                          </div>
                          <div className="mt-4 sm:mt-0 flex gap-4">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center min-w-[100px]">
                              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Manhã</p>
                              <p className="text-lg font-bold text-blue-900 mt-1">{morningApts.length} <span className="text-sm font-normal text-blue-600">/ {maxCapacity}</span></p>
                            </div>
                            <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center min-w-[100px]">
                              <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">Tarde</p>
                              <p className="text-lg font-bold text-orange-900 mt-1">{afternoonApts.length} <span className="text-sm font-normal text-orange-600">/ {maxCapacity}</span></p>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 pt-6">
                          <button
                            onClick={() => {
                              handleCancelEdit();
                              setShowAppointmentModal(true);
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-700 transition shadow-lg shadow-green-100"
                          >
                            <Plus size={24} /> Agendar Consulta
                          </button>
                        </div>
                      </section>

                      <section className="bg-white shadow rounded-lg p-6">
                        <h3 className="font-semibold text-gray-800 mb-4 text-lg">Consultas da Data</h3>
                        {profApts.length === 0 ? (
                          <p className="text-sm text-gray-500">Nenhuma consulta agendada para este profissional nesta data.</p>
                        ) : (
                          <ul className="space-y-3">
                            {profApts.map((apt) => {
                              const aptDate = new Date(apt.date_time);
                              return (
                                <li key={apt.id} className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      {(() => {
                                        const patient = getPatientRecord(apt.patients);
                                        return (
                                          <>
                                            <p className="font-semibold text-gray-800">{patient?.name || 'Paciente não identificado'}</p>
                                            <p className="text-sm text-gray-500">{patient?.cpf ? `CPF: ${formatCPF(patient.cpf)}` : 'CPF não disponível'}</p>
                                          </>
                                        );
                                      })()}
                                    </div>
                                    <div className="text-right text-sm text-gray-500 flex flex-col items-end gap-1">
                                      <p className="font-bold text-gray-700 text-base">{apt.shift === 'morning' ? 'Manhã' : 'Tarde'}</p>
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                        apt.status === 'checked_in' ? 'bg-blue-100 text-blue-700' :
                                        apt.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                                        apt.status === 'attended' ? 'bg-green-100 text-green-700' :
                                        apt.status === 'missed' ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>
                                        {apt.status === 'checked_in' ? 'Na fila' :
                                         apt.status === 'in_progress' ? 'Em atendimento' :
                                         apt.status === 'attended' ? 'Atendido' :
                                         apt.status === 'missed' ? 'Faltou' : 'Agendada'}
                                      </span>
                                    </div>
                                  </div>
                                  {apt.notes && <p className="mt-2 text-sm text-gray-600 italic border-l-2 border-gray-200 pl-2">Obs: {apt.notes}</p>}
                                  <div className="mt-3 flex gap-2 flex-wrap">
                                    {apt.status === 'scheduled' && (() => {
                                      const today = new Date();
                                      today.setHours(0, 0, 0, 0);
                                      const aptDay = new Date(apt.date_time);
                                      aptDay.setHours(0, 0, 0, 0);
                                      const isToday = aptDay.getTime() === today.getTime();
                                      return isToday ? (
                                        <button onClick={() => handleCheckIn(apt.id)} className="inline-flex items-center gap-2 rounded-md bg-blue-600 text-white px-3 py-1.5 text-sm font-bold hover:bg-blue-700 transition shadow-sm">
                                          <UserCheck size={14} /> Check-in
                                        </button>
                                      ) : null;
                                    })()}
                                    <button onClick={() => handleEditAppointment(apt)} className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition">
                                      <Edit size={14} /> Editar
                                    </button>
                                    <button onClick={() => handleDeleteAppointment(apt.id)} className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 text-red-600 px-3 py-1.5 text-sm hover:bg-red-100 hover:border-red-300 transition">
                                      <Trash2 size={14} /> Excluir
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </section>
                    </>
                  );
                })() : (
                  <>

                    <section className="bg-white shadow rounded-lg p-6">
                      <h2 className="text-lg font-semibold text-gray-800 mb-3">Bloqueios e Consultas na unidade</h2>
                      {selectedDateBlocks.length === 0 && selectedDateAppointments.length === 0 ? (
                        <p className="text-sm text-gray-500">Não há bloqueios nem consultas para esta data.</p>
                      ) : (
                        <ul className="space-y-3">
                          {selectedDateBlocks.map((blk) => (
                            <li key={blk.id} className="rounded-lg border border-red-200 p-4 bg-red-50">
                              <div className="font-semibold text-red-800">{blk.professional_name === 'TODOS' ? 'Bloqueio de Unidade' : blk.professional_name}</div>
                              <div className="text-sm text-red-600">{blk.specialty || 'Todos'} • {blk.location}</div>
                              {blk.reason && <p className="mt-2 text-sm text-red-700 font-medium">Motivo: {blk.reason}</p>}
                            </li>
                          ))}
                          {selectedDateAppointments.map((apt) => {
                            const aptDate = new Date(apt.date_time);
                            return (
                              <li key={apt.id} className="rounded-lg border border-gray-200 p-4 bg-white">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-gray-800">{apt.professional_name || apt.specialty}</p>
                                    {(() => {
                                      const patient = getPatientRecord(apt.patients);
                                      return (
                                        <p className="text-sm text-gray-500">Paciente: {patient?.name || 'Não identificado'}</p>
                                      );
                                    })()}
                                  </div>
                                  <div className="text-right text-sm text-gray-500">
                                    <p className="font-bold">{aptDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  </>
                )}
              </aside>
            </div>
            {showAppointmentModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-800">
                      {editingAppointment ? 'Editar Consulta' : 'Agendar Consulta'}
                    </h3>
                    <button onClick={handleCancelEdit} className="p-2 hover:bg-gray-200 rounded-full transition">
                      <Plus size={24} className="rotate-45 text-gray-500" />
                    </button>
                  </div>

                  <div className="p-6 max-h-[80vh] overflow-y-auto">
                    <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-100 flex items-center gap-4">
                      <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {selectedProfessional?.nome.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-green-900">{selectedProfessional?.nome}</p>
                        <p className="text-sm text-green-700">{selectedProfessional?.especialidade} • {selectedDate.toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>

                    <form onSubmit={handleCreateAppointment} className="space-y-5">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Paciente (Busca por CPF)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={patientSearch}
                            onChange={(e) => setPatientSearch(formatCPF(e.target.value))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSearchPatient();
                              }
                            }}
                            className="block w-full rounded-xl border border-gray-300 shadow-sm p-3 focus:border-green-500 focus:ring-green-500 bg-gray-50 text-base font-medium"
                            placeholder="000.000.000-00"
                            maxLength={14}
                          />
                          <button type="button" onClick={handleSearchPatient} disabled={patientLoading} className="inline-flex items-center justify-center rounded-xl bg-gray-800 px-4 text-white hover:bg-black transition disabled:opacity-50">
                            <Search size={20} />
                          </button>
                        </div>
                        {selectedPatient && (
                          <div className="mt-3 flex items-center gap-3 p-3 bg-blue-50 text-blue-800 rounded-xl border border-blue-100">
                            <div className="bg-blue-600 p-1.5 rounded-full text-white">
                              <Users size={14} />
                            </div>
                            <span className="text-sm font-medium">Paciente: <strong>{selectedPatient.name}</strong></span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="relative">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Data</label>
                          <button
                            type="button"
                            onClick={() => setActiveDropdown(activeDropdown === 'date' ? null : 'date')}
                            className={`flex items-center justify-between w-full rounded-xl border shadow-sm p-3 transition text-left bg-white ${activeDropdown === 'date' ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-300'}`}
                          >
                            <span className="text-base font-medium text-gray-800">
                              {(() => {
                                const [y, m, d] = appointmentForm.date.split('-');
                                return `${d}/${m}/${y}`;
                              })()}
                            </span>
                            <Calendar size={20} className="text-gray-400" />
                          </button>

                          {activeDropdown === 'date' && (
                            <>
                              <div className="fixed inset-0 z-[55]" onClick={() => setActiveDropdown(null)} />
                              <div className="absolute top-full left-0 mt-2 z-[60] bg-white border border-gray-200 shadow-2xl rounded-2xl p-4 w-[280px] animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex items-center justify-between mb-4">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setMiniCalendarMonth(new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() - 1, 1)); }} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
                                  <span className="font-bold text-gray-800 uppercase text-xs tracking-wider">
                                    {miniCalendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                  </span>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setMiniCalendarMonth(new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() + 1, 1)); }} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-2">
                                  <div>D</div><div>S</div><div>T</div><div>Q</div><div>Q</div><div>S</div><div>S</div>
                                </div>
                                <div className="grid grid-cols-7 gap-1">
                                  {(() => {
                                    const firstDay = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), 1).getDay();
                                    const daysInMonth = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() + 1, 0).getDate();
                                    const blanks = Array.from({ length: firstDay }, (_, i) => i);
                                    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

                                    return (
                                      <>
                                        {blanks.map(b => <div key={`b-${b}`} />)}
                                        {days.map(d => {
                                          const date = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), d);
                                          const isToday = new Date().toDateString() === date.toDateString();
                                          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                                          const isSelected = appointmentForm.date === dateStr;

                                          return (
                                            <button
                                              key={d}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setAppointmentForm({ ...appointmentForm, date: dateStr });
                                                setActiveDropdown(null);
                                              }}
                                              className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs transition
                                                ${isSelected ? 'bg-green-600 text-white font-bold shadow-md' : 'hover:bg-green-50 text-gray-700'}
                                                ${isToday && !isSelected ? 'border border-green-200 text-green-700' : ''}
                                              `}
                                            >
                                              {d}
                                            </button>
                                          );
                                        })}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="relative">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Turno</label>
                          <button
                            type="button"
                            onClick={() => setActiveDropdown(activeDropdown === 'shift' ? null : 'shift')}
                            className={`flex items-center justify-between w-full rounded-xl border shadow-sm p-3 transition text-left bg-white ${activeDropdown === 'shift' ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-300'}`}
                          >
                            <span className="text-base font-medium text-gray-800">
                              {appointmentForm.shift === 'morning' ? 'Manhã' : 'Tarde'}
                            </span>
                            <ChevronLeft size={18} className={`text-gray-400 transition-transform duration-200 ${activeDropdown === 'shift' ? 'rotate-90' : '-rotate-90'}`} />
                          </button>

                          {activeDropdown === 'shift' && (
                            <>
                              <div className="fixed inset-0 z-[55]" onClick={() => setActiveDropdown(null)} />
                              <div className="absolute top-full left-0 mt-2 z-[60] bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden w-full animate-in fade-in slide-in-from-top-2 duration-200">
                                <button
                                  type="button"
                                  onClick={() => { setAppointmentForm({ ...appointmentForm, shift: 'morning' }); setActiveDropdown(null); }}
                                  className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition ${appointmentForm.shift === 'morning' ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                >
                                  Manhã
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setAppointmentForm({ ...appointmentForm, shift: 'afternoon' }); setActiveDropdown(null); }}
                                  className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition border-t border-gray-100 ${appointmentForm.shift === 'afternoon' ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                >
                                  Tarde
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div className="relative">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                          <button
                            type="button"
                            onClick={() => setActiveDropdown(activeDropdown === 'status' ? null : 'status')}
                            className={`flex items-center justify-between w-full rounded-xl border shadow-sm p-3 transition text-left bg-white ${activeDropdown === 'status' ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-300'}`}
                          >
                            <span className="text-base font-medium text-gray-800">
                              {(() => {
                                switch (appointmentForm.status) {
                                  case 'scheduled': return 'Agendada';
                                  case 'in_progress': return 'Em andamento';
                                  case 'attended': return 'Compareceu';
                                  case 'missed': return 'Faltou';
                                  default: return appointmentForm.status;
                                }
                              })()}
                            </span>
                            <ChevronLeft size={18} className={`text-gray-400 transition-transform duration-200 ${activeDropdown === 'status' ? 'rotate-90' : '-rotate-90'}`} />
                          </button>

                          {activeDropdown === 'status' && (
                            <>
                              <div className="fixed inset-0 z-[55]" onClick={() => setActiveDropdown(null)} />
                              <div className="absolute top-full left-0 mt-2 z-[60] bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden w-full animate-in fade-in slide-in-from-top-2 duration-200">
                                {[
                                  { id: 'scheduled', label: 'Agendada' },
                                  { id: 'in_progress', label: 'Em andamento' },
                                  { id: 'attended', label: 'Compareceu' },
                                  { id: 'missed', label: 'Faltou' }
                                ].map((item, idx) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => { setAppointmentForm({ ...appointmentForm, status: item.id }); setActiveDropdown(null); }}
                                    className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition ${idx > 0 ? 'border-t border-gray-100' : ''} ${appointmentForm.status === item.id ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                  >
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Observações</label>
                        <textarea
                          value={appointmentForm.notes}
                          onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
                          className="block w-full rounded-xl border border-gray-300 shadow-sm p-3 focus:border-green-500 focus:ring-green-500 bg-white text-base font-medium"
                          rows={3}
                          placeholder="Ex: Primeira consulta, retorno..."
                        />
                      </div>

                      <div className="pt-4 flex gap-3">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="flex-1 px-4 py-4 border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={creatingAppointment || !selectedPatient}
                          className="flex-[2] bg-green-600 text-white py-4 px-4 rounded-xl font-bold hover:bg-green-700 transition shadow-lg shadow-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {creatingAppointment ? 'Processando...' : (editingAppointment ? 'Salvar Alterações' : 'Confirmar Agendamento')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      {notification && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`rounded-2xl shadow-2xl border p-4 flex items-center gap-4 min-w-[320px] ${
            notification.type === 'success' ? 'bg-green-600 border-green-500 text-white' : 
            notification.type === 'error' ? 'bg-red-600 border-red-500 text-white' : 
            'bg-blue-600 border-blue-500 text-white'
          }`}>
            <div className="bg-white bg-opacity-20 rounded-full p-2">
              {notification.type === 'success' && <Plus className="rotate-0" size={20} />}
              {notification.type === 'error' && <Ban size={20} />}
              {notification.type === 'info' && <Search size={20} />}
            </div>
            <div className="flex-1 pr-4">
              <p className="font-bold text-sm leading-tight">{notification.type === 'success' ? 'Sucesso' : notification.type === 'error' ? 'Erro' : 'Informação'}</p>
              <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="p-1 hover:bg-white hover:bg-opacity-10 rounded-lg transition">
              <Plus size={18} className="rotate-45" />
            </button>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full mb-4 ${confirmModal.danger ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                {confirmModal.danger ? <Trash2 size={24} /> : <Ban className="rotate-180" size={24} />}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{confirmModal.title}</h3>
              <p className="text-sm text-gray-500">{confirmModal.message}</p>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                className="inline-flex justify-center rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition min-w-[100px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`inline-flex justify-center rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-sm transition min-w-[100px] ${confirmModal.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

