import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Plus, Trash2, Ban, Search, Edit, ChevronLeft, ChevronRight, Calendar, Users, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { calculateDateTimeFromShift, getShiftFromHour, type ShiftType } from '../../lib/database.types';
import { CnesService } from '../../lib/cnesService';
import { AppointmentService } from '../../lib/appointmentService';

type Professional = {
  user_id?: string;
  name: string;
  specialty: string;
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
  cnes_id?: string;
  specialty?: string;
  professional_cns?: string;
  patient_id?: string;
  shift?: string;
  patients?: Patient | Patient[];
  professionals?: {
    name: string;
    specialty: string;
  };
};

type BlockedTime = {
  id: string;
  date_time: string;
  cnes_id?: string;
  professional_cns?: string;
  reason?: string;
  shift?: string;
  professionals?: {
    name: string;
    specialty: string;
  };
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
  const { showNotification } = useNotification();
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    danger?: boolean;
  }>({ show: false, title: '', message: '', onConfirm: () => { } });

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
  const [blockShift, setBlockShift] = useState<'all' | 'morning' | 'afternoon'>('all');

  // Filtros para a visão da Unidade (quando nenhum profissional está selecionado)
  const [unitFilterShift, setUnitFilterShift] = useState<ShiftType | 'all'>('all');
  const [unitFilterProfessionalCns, setUnitFilterProfessionalCns] = useState<string>('all');

  // Filtro para a visão do Profissional (quando um profissional está selecionado)
  const [dateFilterShift, setDateFilterShift] = useState<ShiftType | 'all'>('all');




  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const profResult = await supabase
        .from('professionals')
        .select('user_id, name, specialty, cns')
        .eq('cnes', profile?.cnes)
        .order('name', { ascending: true });

      if (profResult.error) throw profResult.error;

      const aptResult = await supabase
        .from('appointments')
        .select(`
          *,
          patients ( name, cpf ),
          professionals ( name, specialty )
        `)
        .eq('cnes_id', profile?.cnes)
        .gte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString())
        .lte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString())
        .order('date_time', { ascending: true });

      const blockResult = await supabase
        .from('blocked_times')
        .select('*, professionals(name, specialty)')
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
      const isHealthProf = (specialty: string) => {
        const upper = specialty.toUpperCase();
        return healthKeywords.some(key => upper.includes(key));
      };

      // Mescla profissionais do banco com profissionais do CNES usando CNS como chave
      const dbProfs = profResult.data || [];
      const mergedProfs: Professional[] = cnesProfs
        .filter(cp => isHealthProf(cp.specialty))
        .map(cp => {
          const matchingDb = dbProfs.find(p => p.cns === cp.cns);
          return {
            user_id: matchingDb?.user_id,
            name: cp.name,
            specialty: cp.specialty,
            cns: cp.cns
          };
        });

      // Adiciona profissionais do banco que não estão no CNES (também filtrando por especialidade)
      dbProfs.forEach(dp => {
        if (dp.cns && !mergedProfs.find(mp => mp.cns === dp.cns)) {
          if (isHealthProf(dp.specialty || '')) {
            mergedProfs.push({
              user_id: dp.user_id,
              name: dp.name,
              specialty: dp.specialty || 'Outros',
              cns: dp.cns
            });
          }
        }
      });

      setProfessionals(mergedProfs);
    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      showNotification('error', err.message || 'Erro ao carregar dados da agenda.');
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
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAppointmentModal) {
        handleCancelEdit();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showAppointmentModal]);



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
      if (p.specialty) s.add(p.specialty);
    });
    return Array.from(s).sort();
  }, [professionals]);

  const filteredProfessionalsBySpecialty = useMemo(() => {
    if (!selectedSpecialty) return professionals;
    return professionals.filter(p => p.specialty === selectedSpecialty);
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
      location: apt.cnes_id || profile?.cnes || '',
      notes: apt.notes || '',
      status: apt.status || 'scheduled',
    });
  };

  const handleCancelEdit = () => {
    setEditingAppointment(null);
    setSelectedPatient(null);
    setPatientSearch('');
    setShowAppointmentModal(false);
    setActiveDropdown(null);
    setMiniCalendarMonth(selectedDate);
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();
    const defaultShift = (isToday && now.getHours() >= 13) ? 'afternoon' : 'morning';

    setAppointmentForm((prev) => ({
      ...prev,
      date: `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`,
      shift: defaultShift as 'morning' | 'afternoon',
      location: profile?.cnes || '',
      notes: '',
      status: 'scheduled',
    }));
  };

  const filteredAppointments = useMemo(() => {
    if (!selectedProfessionalCns) return appointments;
    return appointments.filter((apt) => {
      return apt.professional_cns === selectedProfessionalCns;
    });
  }, [appointments, selectedProfessionalCns, selectedProfessional]);

  const filteredBlockedTimes = useMemo(() => {
    if (!selectedProfessionalCns) return blockedTimes;
    return blockedTimes.filter((blk) => {
      if (blk.professional_cns) return blk.professional_cns === selectedProfessionalCns;
      return blk.professionals?.name === selectedProfessional?.name;
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

  // Listas finais filtradas para exibição
  const finalFilteredAppointments = useMemo(() => {
    return selectedDateAppointments.filter(apt => {
      // Filtro de turno
      const currentShiftFilter = selectedProfessionalCns ? dateFilterShift : unitFilterShift;
      const matchesShift = currentShiftFilter === 'all' || apt.shift === currentShiftFilter;

      // Filtro de profissional (apenas se não houver um profissional selecionado globalmente)
      const matchesProfessional = selectedProfessionalCns || unitFilterProfessionalCns === 'all' || apt.professional_cns === unitFilterProfessionalCns;

      return matchesShift && matchesProfessional;
    });
  }, [selectedDateAppointments, selectedProfessionalCns, dateFilterShift, unitFilterShift, unitFilterProfessionalCns]);

  const finalFilteredBlocks = useMemo(() => {
    return selectedDateBlocks.filter(blk => {
      // Filtro de turno
      const matchesShift = unitFilterShift === 'all' || blk.shift === unitFilterShift;

      // Filtro de profissional
      const matchesProfessional = unitFilterProfessionalCns === 'all' || blk.professional_cns === unitFilterProfessionalCns;

      return matchesShift && matchesProfessional;
    });
  }, [selectedDateBlocks, unitFilterShift, unitFilterProfessionalCns]);

  const getPatientRecord = (patients?: Patient | Patient[] | null) => {
    if (!patients) return null;
    return Array.isArray(patients) ? patients[0] : patients;
  };

  const handleSearchPatient = async () => {
    const cpfClean = patientSearch.replace(/\D/g, '');
    if (!cpfClean || cpfClean.length < 8) {
      showNotification('error', 'Informe um CPF válido para buscar o paciente.');
      return;
    }
    setPatientLoading(true);
    try {
      const { data, error } = await supabase.from('patients').select('id, name, cpf').eq('cpf', cpfClean).single();
      if (error || !data) {
        showNotification('error', 'Paciente não encontrado.');
        setSelectedPatient(null);
        return;
      }
      setSelectedPatient(data as Patient);
    } catch (err) {
      console.error('Erro ao buscar paciente:', err);
      showNotification('error', 'Erro ao buscar paciente.');
    } finally {
      setPatientLoading(false);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      showNotification('error', 'Selecione um paciente válido antes de agendar.');
      return;
    }
    const targetProfCns = appointmentForm.professionalCns || selectedProfessionalCns;

    if (!targetProfCns) {
      showNotification('error', 'Selecione um profissional para o agendamento.');
      return;
    }

    const professional = professionals.find(p => p.cns === targetProfCns);
    const dateTime = calculateDateTimeFromShift(appointmentForm.date, appointmentForm.shift);

    // Validação de data e turno retroativos
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (appointmentForm.date < todayStr) {
      showNotification('error', 'Não é possível realizar agendamentos em datas retroativas.');
      return;
    }

    if (appointmentForm.date === todayStr && appointmentForm.shift === 'morning' && now.getHours() >= 13) {
      showNotification('error', 'O turno da manhã não está mais disponível para agendamento hoje.');
      return;
    }

    try {
      setCreatingAppointment(true);

      // Verificação de capacidade (Limite de 5 por turno)
      if (!editingAppointment) {
        const availability = await AppointmentService.checkAvailability(
          profile?.cnes || '',
          professional?.specialty || '',
          appointmentForm.shift,
          appointmentForm.date,
          targetProfCns
        );

        if (availability.isBlocked) {
          showNotification('error', `Não é possível agendar: esta data está bloqueada para ${targetProfCns ? 'este profissional' : 'toda a unidade'}.`);
          setCreatingAppointment(false);
          return;
        }

        if (availability.isFull) {
          showNotification('error', `Capacidade máxima atingida para o turno da ${appointmentForm.shift === 'morning' ? 'manhã' : 'tarde'} (${availability.booked}/5).`);
          setCreatingAppointment(false);
          return;
        }
      }
      const payload: any = {
        date_time: dateTime,
        status: appointmentForm.status,
        notes: appointmentForm.notes,
        cnes_id: profile?.cnes || '',
        specialty: professional?.specialty || '',
        professional_cns: targetProfCns,
        patient_id: selectedPatient.id,
        shift: appointmentForm.shift,
      };

      if (editingAppointment) {
        const { error } = await supabase.from('appointments').update(payload).eq('id', editingAppointment.id);
        if (error) throw error;
        showNotification('success', 'Consulta atualizada com sucesso.');
        setEditingAppointment(null);
      } else {
        const { error } = await supabase.from('appointments').insert([payload]);
        if (error) throw error;
        showNotification('success', 'Consulta agendada com sucesso.');
      }

      setPatientSearch('');
      setSelectedPatient(null);
      setShowAppointmentModal(false);
      fetchData();
    } catch (err: any) {
      console.error('Erro ao agendar consulta:', err);
      showNotification('error', err.message || 'Erro ao salvar consulta.');
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
          showNotification('success', 'Consulta excluída.');
          fetchData();
        } catch (err: any) {
          console.error('Erro ao excluir consulta:', err);
          showNotification('error', err.message || 'Erro ao excluir consulta.');
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
      showNotification('success', 'Check-in realizado! Paciente adicionado à fila.');
      fetchData();
    } catch (err: any) {
      showNotification('error', 'Erro ao fazer check-in: ' + err.message);
    }
  };

  const handleToggleBlock = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(selectedDate);
    checkDate.setHours(0, 0, 0, 0);
    const isPast = checkDate < today;

    const isUnitBlock = !selectedProfessionalCns;
    const currentBlocks = isUnitBlock
      ? selectedDateBlocks.filter(blk => !blk.professional_cns && (blockShift === 'all' ? true : blk.shift === blockShift))
      : selectedDateBlocks.filter(blk => blk.professional_cns === selectedProfessionalCns && (blockShift === 'all' ? true : blk.shift === blockShift));

    const alreadyBlocked = currentBlocks.length > 0;

    if (isPast) {
      showNotification('error', 'Não é possível alterar bloqueios em datas retroativas.');
      return;
    }

    const hasAppointments = isUnitBlock
      ? selectedDateAppointments.length > 0
      : selectedDateAppointments.some((apt) => apt.professional_cns === selectedProfessionalCns);

    const confirmBlock = async () => {
      try {
        setBlockingDate(true);
        const block = {
          date_time: new Date(`${selectedDate.toISOString().split('T')[0]}T00:00:00`).toISOString(),
          professional_cns: isUnitBlock ? null : selectedProfessional?.cns || null,
          cnes_id: profile?.cnes || '',
          reason: blockReason || (isUnitBlock ? 'Bloqueio de unidade' : `Bloqueio de agenda`),
          shift: blockShift
        };
        const { error } = await supabase.from('blocked_times').insert([block]);
        if (error) throw error;
        const shiftLabel = blockShift === 'all' ? 'o dia todo' : (blockShift === 'morning' ? 'o turno da manhã' : 'o turno da tarde');
        showNotification('success', `Bloqueio realizado para ${shiftLabel} (${isUnitBlock ? 'Unidade' : selectedProfessional?.name}).`);
        setBlockReason('');
        fetchData();
      } catch (err: any) {
        console.error('Erro ao bloquear dia:', err);
        showNotification('error', err.message || 'Erro ao bloquear dia.');
      } finally {
        setBlockingDate(false);
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    };

    if (alreadyBlocked) {
      setConfirmModal({
        show: true,
        title: 'Liberar Bloqueio',
        message: `Deseja liberar o bloqueio desta data para ${isUnitBlock ? 'toda a unidade' : selectedProfessional?.name}?`,
        onConfirm: async () => {
          try {
            const ids = currentBlocks.map((blk) => blk.id);
            const { error } = await supabase.from('blocked_times').delete().in('id', ids);
            if (error) throw error;
            showNotification('success', 'Bloqueio liberado com sucesso.');
            fetchData();
          } catch (err: any) {
            console.error('Erro ao desbloquear dia:', err);
            showNotification('error', err.message || 'Erro ao desbloquear dia.');
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
        : `Deseja bloquear a agenda para ${isUnitBlock ? 'toda a unidade' : selectedProfessional?.name} nesta data?`,
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
          <button onClick={fetchData} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition font-bold text-sm shadow-sm">
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
                const matchesProf = isUnitBlock ? !blk.professional_cns : blk.professional_cns === selectedProfessionalCns;
                return matchesProf && (blockShift === 'all' ? blk.shift === 'all' : blk.shift === blockShift);
              });
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const checkDate = new Date(selectedDate);
              checkDate.setHours(0, 0, 0, 0);
              const isPastDate = checkDate < today;

              const alreadyBlocked = currentBlocks.length > 0;

              const appointmentsToCheck = isUnitBlock
                ? selectedDateAppointments.filter(a => blockShift === 'all' ? true : a.shift === blockShift)
                : selectedDateAppointments.filter(a => a.professional_cns === selectedProfessionalCns && (blockShift === 'all' ? true : a.shift === blockShift));

              return (
                <section className="bg-white shadow rounded-lg p-6 mb-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        <Ban className="text-red-600" size={20} />
                        {isUnitBlock ? 'Bloquear Toda a Unidade' : `Bloquear Agenda: ${formatCapitalize(selectedProfessional?.name || '')}`}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {isUnitBlock
                          ? 'Impede agendamentos para TODOS os profissionais nesta data.'
                          : `Impede novos agendamentos para o profissional selecionado em ${selectedDate.toLocaleDateString('pt-BR')}.`}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-end gap-3">
                      <div className="w-full sm:w-80">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Motivo do bloqueio</label>
                        <input
                          type="text"
                          value={blockReason}
                          onChange={(e) => setBlockReason(e.target.value)}
                          maxLength={30}
                          className="block w-full h-10 rounded-md border border-gray-300 shadow-sm px-3 text-sm focus:border-red-500 focus:ring-red-500"
                          placeholder={isUnitBlock ? "Ex: Reunião de equipe" : "Ex: Férias, Atestado"}
                        />
                      </div>

                      <div className="w-full sm:w-48 relative">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Turno</label>
                        <button
                          type="button"
                          onClick={() => setActiveDropdown(activeDropdown === 'blockShift' ? null : 'blockShift')}
                          className="w-full h-10 flex items-center justify-between rounded-md border border-gray-300 shadow-sm px-3 text-sm bg-white hover:bg-gray-50 transition"
                        >
                          <span>{blockShift === 'all' ? 'Dia Inteiro' : (blockShift === 'morning' ? 'Manhã' : 'Tarde')}</span>
                          <ChevronLeft size={16} className={`text-gray-400 transition-transform ${activeDropdown === 'blockShift' ? 'rotate-90' : '-rotate-90'}`} />
                        </button>

                        {activeDropdown === 'blockShift' && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActiveDropdown(null)} />
                            <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                              {[
                                { id: 'all', label: 'Dia Inteiro' },
                                { id: 'morning', label: 'Manhã' },
                                { id: 'afternoon', label: 'Tarde' }
                              ].map((shift) => (
                                <button
                                  key={shift.id}
                                  onClick={() => { setBlockShift(shift.id as any); setActiveDropdown(null); }}
                                  className={`w-full px-4 py-2 text-left text-sm hover:bg-red-50 transition border-b border-gray-50 last:border-0 ${blockShift === shift.id ? 'bg-red-50 text-red-700 font-bold' : 'text-gray-700'}`}
                                >
                                  {shift.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="w-full sm:w-48">
                        <button
                          type="button"
                          onClick={handleToggleBlock}
                          disabled={blockingDate || isPastDate}
                          className={`w-full h-10 inline-flex justify-center items-center gap-2 rounded-md px-6 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${alreadyBlocked ? 'bg-gray-600 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-700'} ${isPastDate ? 'grayscale cursor-not-allowed' : ''}`}
                        >
                          {blockingDate ? 'Processando...' : (isPastDate ? (alreadyBlocked ? 'Bloqueio Permanente' : 'Data Retroativa') : (alreadyBlocked ? (blockShift === 'all' ? 'Desbloquear Dia' : 'Desbloquear Turno') : (blockShift === 'all' ? 'Bloquear Dia' : 'Bloquear Turno')))}
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
                        Atenção: {appointmentsToCheck.length === 1 ? 'Existe' : 'Existem'} <strong>{appointmentsToCheck.length} {appointmentsToCheck.length === 1 ? 'consulta' : 'consultas'}</strong> já agendadas para este {blockShift === 'all' ? 'filtro' : 'turno'}.
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
                              {specialties.map((esp) => (
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
                            {selectedProfessionalCns ? formatCapitalize(professionals.find(p => p.cns === selectedProfessionalCns)?.name || '') : 'Nenhum profissional'}
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
                              {filteredProfessionalsBySpecialty.map((prof) => (
                                <button
                                  key={prof.cns}
                                  type="button"
                                  onClick={() => { setSelectedProfessionalCns(prof.cns); setActiveDropdown(null); }}
                                  className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition border-t border-gray-100 ${selectedProfessionalCns === prof.cns ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                >
                                  {formatCapitalize(prof.name)}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setEditingAppointment(null);
                          setSelectedPatient(null);
                          setAppointmentForm(prev => ({
                            ...prev,
                            date: selectedDate.toISOString().split('T')[0],
                            notes: '',
                            status: 'scheduled',
                            professionalCns: selectedProfessionalCns
                          }));
                          setShowAppointmentModal(true);
                        }}
                        className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-white font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-100"
                      >
                        <Plus size={20} /> Agendar Consulta
                      </button>
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
                    return a.professional_cns === selectedProfessionalCns;
                  });
                  const morningApts = profApts.filter(a => a.shift === 'morning' || (!a.shift && new Date(a.date_time).getHours() < 12));
                  const afternoonApts = profApts.filter(a => a.shift === 'afternoon' || (!a.shift && new Date(a.date_time).getHours() >= 12));
                  const maxCapacity = 5;

                  return (
                    <>
                      <section className="bg-white shadow rounded-lg p-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                          <div>
                            <h2 className="text-xl font-bold text-gray-800">{selectedProfessional?.name}</h2>
                            <p className="text-sm text-gray-500">{selectedProfessional?.specialty || 'Clínico Geral'}</p>
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

                      </section>

                      <section className="bg-white shadow rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-gray-800 text-lg">Consultas da Data</h3>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setActiveDropdown(activeDropdown === 'dateShift' ? null : 'dateShift')}
                              className={`flex items-center justify-between min-w-[160px] gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${activeDropdown === 'dateShift' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:border-green-300'}`}
                            >
                              <span>{dateFilterShift === 'all' ? 'Todos os Turnos' : dateFilterShift === 'morning' ? 'Manhã' : 'Tarde'}</span>
                              <ChevronRight size={14} className={`transition-transform ${activeDropdown === 'dateShift' ? 'rotate-90' : ''}`} />
                            </button>

                            {activeDropdown === 'dateShift' && (
                              <>
                                <div className="fixed inset-0 z-[55]" onClick={() => setActiveDropdown(null)} />
                                <div className="absolute top-full right-0 mt-2 z-[60] bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden min-w-[150px] animate-in fade-in slide-in-from-top-2 duration-200">
                                  <button
                                    onClick={() => { setDateFilterShift('all'); setActiveDropdown(null); }}
                                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-green-50 transition ${dateFilterShift === 'all' ? 'bg-green-50 text-green-700 font-bold' : 'text-gray-700'}`}
                                  >
                                    Todos os Turnos
                                  </button>
                                  <button
                                    onClick={() => { setDateFilterShift('morning'); setActiveDropdown(null); }}
                                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-green-50 transition border-t border-gray-100 ${dateFilterShift === 'morning' ? 'bg-green-50 text-green-700 font-bold' : 'text-gray-700'}`}
                                  >
                                    Manhã
                                  </button>
                                  <button
                                    onClick={() => { setDateFilterShift('afternoon'); setActiveDropdown(null); }}
                                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-green-50 transition border-t border-gray-100 ${dateFilterShift === 'afternoon' ? 'bg-green-50 text-green-700 font-bold' : 'text-gray-700'}`}
                                  >
                                    Tarde
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        {finalFilteredAppointments.length === 0 ? (
                          <p className="text-sm text-gray-500">Nenhuma consulta agendada para este profissional nesta data com os filtros selecionados.</p>
                        ) : (
                          <ul className="space-y-3">
                            {finalFilteredAppointments.map((apt) => {
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
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${apt.status === 'checked_in' ? 'bg-blue-100 text-blue-700' :
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
                      <div className="flex flex-col gap-4 mb-6">
                        <h2 className="text-lg font-semibold text-gray-800">Bloqueios e Consultas na unidade</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Dropdown Turno Unidade */}
                          <div className="relative">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Turno</label>
                            <button
                              type="button"
                              onClick={() => setActiveDropdown(activeDropdown === 'unitShift' ? null : 'unitShift')}
                              className={`flex items-center justify-between w-full rounded-xl border bg-white p-3 transition-all ${activeDropdown === 'unitShift' ? 'border-green-500 ring-2 ring-green-50' : 'border-gray-200 hover:border-green-300'}`}
                            >
                              <span className="text-sm font-semibold text-gray-700">
                                {unitFilterShift === 'all' ? 'Todos os Turnos' : unitFilterShift === 'morning' ? 'Manhã' : 'Tarde'}
                              </span>
                              <ChevronRight size={16} className={`text-gray-400 transition-transform ${activeDropdown === 'unitShift' ? 'rotate-90' : ''}`} />
                            </button>

                            {activeDropdown === 'unitShift' && (
                              <>
                                <div className="fixed inset-0 z-[55]" onClick={() => setActiveDropdown(null)} />
                                <div className="absolute top-full left-0 mt-2 z-[60] bg-white border border-gray-200 shadow-2xl rounded-xl overflow-hidden w-full animate-in fade-in slide-in-from-top-2 duration-200">
                                  <button
                                    onClick={() => { setUnitFilterShift('all'); setActiveDropdown(null); }}
                                    className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition ${unitFilterShift === 'all' ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                  >
                                    Todos os Turnos
                                  </button>
                                  <button
                                    onClick={() => { setUnitFilterShift('morning'); setActiveDropdown(null); }}
                                    className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition border-t border-gray-100 ${unitFilterShift === 'morning' ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                  >
                                    Manhã
                                  </button>
                                  <button
                                    onClick={() => { setUnitFilterShift('afternoon'); setActiveDropdown(null); }}
                                    className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition border-t border-gray-100 ${unitFilterShift === 'afternoon' ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                  >
                                    Tarde
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Dropdown Profissional Unidade */}
                          <div className="relative">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Profissional</label>
                            <button
                              type="button"
                              onClick={() => setActiveDropdown(activeDropdown === 'unitProf' ? null : 'unitProf')}
                              className={`flex items-center justify-between w-full rounded-xl border bg-white p-3 transition-all ${activeDropdown === 'unitProf' ? 'border-green-500 ring-2 ring-green-50' : 'border-gray-200 hover:border-green-300'}`}
                            >
                              <span className="text-sm font-semibold text-gray-700 truncate mr-2">
                                {unitFilterProfessionalCns === 'all' ? 'Todos os Profissionais' : formatCapitalize(professionals.find(p => p.cns === unitFilterProfessionalCns)?.name || '')}
                              </span>
                              <ChevronRight size={16} className={`text-gray-400 transition-transform ${activeDropdown === 'unitProf' ? 'rotate-90' : ''}`} />
                            </button>

                            {activeDropdown === 'unitProf' && (
                              <>
                                <div className="fixed inset-0 z-[55]" onClick={() => setActiveDropdown(null)} />
                                <div className="absolute top-full left-0 mt-2 z-[60] bg-white border border-gray-200 shadow-2xl rounded-xl overflow-hidden w-full animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto">
                                  <button
                                    onClick={() => { setUnitFilterProfessionalCns('all'); setActiveDropdown(null); }}
                                    className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition ${unitFilterProfessionalCns === 'all' ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                  >
                                    Todos os Profissionais
                                  </button>
                                  {professionals.map((p) => (
                                    <button
                                      key={p.cns}
                                      onClick={() => { setUnitFilterProfessionalCns(p.cns); setActiveDropdown(null); }}
                                      className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition border-t border-gray-100 ${unitFilterProfessionalCns === p.cns ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                    >
                                      {formatCapitalize(p.name)}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {finalFilteredBlocks.length === 0 && finalFilteredAppointments.length === 0 ? (
                        <p className="text-sm text-gray-500">Não há bloqueios nem consultas para esta data com os filtros selecionados.</p>
                      ) : (
                        <ul className="space-y-3">
                          {finalFilteredBlocks.map((blk) => (
                            <li key={blk.id} className="rounded-lg border border-red-200 p-4 bg-red-50">
                              <div className="font-semibold text-red-800">{blk.professionals?.name || 'Bloqueio de Unidade'}</div>
                              <div className="text-sm text-red-600">{blk.professionals?.specialty || 'Todos'}</div>
                              {blk.reason && <p className="mt-2 text-sm text-red-700 font-medium">Motivo: {blk.reason}</p>}
                            </li>
                          ))}
                          {finalFilteredAppointments.map((apt) => {
                            return (
                              <li key={apt.id} className="rounded-lg border border-gray-200 p-4 bg-white">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-gray-800">{apt.professionals?.name || apt.specialty}</p>
                                    {(() => {
                                      const patient = getPatientRecord(apt.patients);
                                      return (
                                        <p className="text-sm text-gray-500">Paciente: {patient?.name || 'Não identificado'}</p>
                                      );
                                    })()}
                                  </div>
                                  <div className="text-right text-sm text-gray-500">
                                    <p className="font-bold">{apt.shift === 'morning' ? 'Manhã' : 'Tarde'}</p>
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
                    {editingAppointment && (
                      <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-300 flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {selectedProfessional?.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="font-bold text-green-900">{selectedProfessional?.name}</p>
                          <p className="text-sm text-green-700">{selectedProfessional?.specialty} • {selectedDate.toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleCreateAppointment} className="space-y-5">
                      {!editingAppointment && (
                        <div className="relative">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Profissional</label>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setActiveDropdown(activeDropdown === 'modalProf' ? null : 'modalProf')}
                              className={`flex items-center justify-between w-full rounded-xl border shadow-sm p-3 transition text-left bg-white ${activeDropdown === 'modalProf' ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-300'}`}
                            >
                              <div className="flex items-center gap-3">
                                {appointmentForm.professionalCns ? (
                                  <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold text-xs">
                                    {professionals.find(p => p.cns === appointmentForm.professionalCns)?.name.charAt(0)}
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center font-bold text-xs">?</div>
                                )}
                                <span className="text-base font-medium text-gray-800">
                                  {appointmentForm.professionalCns ? formatCapitalize(professionals.find(p => p.cns === appointmentForm.professionalCns)?.name || '') : 'Selecione o profissional...'}
                                </span>
                              </div>
                              <ChevronLeft size={18} className={`text-gray-400 transition-transform duration-200 ${activeDropdown === 'modalProf' ? 'rotate-90' : '-rotate-90'}`} />
                            </button>

                            {activeDropdown === 'modalProf' && (
                              <>
                                <div className="fixed inset-0 z-[60]" onClick={() => setActiveDropdown(null)} />
                                <div className="absolute top-full left-0 mt-2 z-[70] bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden w-full animate-in fade-in slide-in-from-top-2 duration-200 max-h-48 overflow-y-auto custom-scrollbar">
                                  {professionals.map((prof) => (
                                    <button
                                      key={prof.cns}
                                      type="button"
                                      onClick={() => {
                                        setAppointmentForm({ ...appointmentForm, professionalCns: prof.cns });
                                        setActiveDropdown(null);
                                      }}
                                      className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition border-t border-gray-100 ${appointmentForm.professionalCns === prof.cns ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                    >
                                      {formatCapitalize(prof.name)} - <span className="text-xs text-gray-400">{prof.specialty}</span>
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {!editingAppointment && (
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
                        </div>
                      )}

                      {selectedPatient && (
                        <div className={`${!editingAppointment ? 'mt-3' : ''} flex items-center gap-3 p-3 bg-blue-50 text-blue-800 rounded-xl border border-blue-300`}>
                          <div className="bg-blue-600 p-1.5 rounded-full text-white">
                            <Users size={14} />
                          </div>
                          <span className="text-lg font-medium">Paciente: <strong>{selectedPatient.name}</strong></span>
                        </div>
                      )}

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
                                    const now = new Date();
                                    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);

                                    return (
                                      <>
                                        {blanks.map(b => <div key={`b-${b}`} />)}
                                        {days.map(d => {
                                          const date = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), d);
                                          const isToday = new Date().toDateString() === date.toDateString();
                                          const isPast = date < today;
                                          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                                          const isSelected = appointmentForm.date === dateStr;

                                          return (
                                            <button
                                              key={d}
                                              type="button"
                                              disabled={isPast}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const now = new Date();
                                                let newShift = appointmentForm.shift;
                                                if (dateStr === todayStr && now.getHours() >= 13) {
                                                  newShift = 'afternoon';
                                                }
                                                setAppointmentForm({ ...appointmentForm, date: dateStr, shift: newShift });
                                                setActiveDropdown(null);
                                              }}
                                              className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs transition
                                                ${isSelected ? 'bg-green-600 text-white font-bold shadow-md' : isPast ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-green-50 text-gray-700'}
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
                                {(() => {
                                  const now = new Date();
                                  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                                  const isMorningDisabled = appointmentForm.date === todayStr && now.getHours() >= 13;

                                  return (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isMorningDisabled}
                                        onClick={() => { setAppointmentForm({ ...appointmentForm, shift: 'morning' }); setActiveDropdown(null); }}
                                        className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition ${appointmentForm.shift === 'morning' ? 'text-green-700 bg-green-50' : isMorningDisabled ? 'text-gray-300 cursor-not-allowed bg-gray-50' : 'text-gray-700'}`}
                                      >
                                        Manhã {isMorningDisabled && <span className="text-[10px] font-normal ml-2"></span>}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { setAppointmentForm({ ...appointmentForm, shift: 'afternoon' }); setActiveDropdown(null); }}
                                        className={`w-full px-4 py-3 text-left text-sm font-medium hover:bg-green-50 transition border-t border-gray-100 ${appointmentForm.shift === 'afternoon' ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                                      >
                                        Tarde
                                      </button>
                                    </>
                                  );
                                })()}
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

