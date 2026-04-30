import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Plus, Trash2, Ban, Search, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Professional = {
  id: string;
  nome: string;
  especialidade?: string;
  cnes?: string;
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
  patient_id?: string;
  users?: Patient | Patient[];
};

type BlockedTime = {
  id: string;
  date_time: string;
  location?: string;
  specialty?: string;
  professional_name?: string;
  reason?: string;
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
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  const [appointmentForm, setAppointmentForm] = useState({
    professionalId: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    location: '',
    notes: '',
    status: 'scheduled',
  });
  const [creatingAppointment, setCreatingAppointment] = useState(false);
  const [blockingDate, setBlockingDate] = useState(false);
  const [blockReason, setBlockReason] = useState('Bloqueio de agenda');

  useEffect(() => {
    if (profile?.cnes) {
      fetchData();
    }
  }, [profile, currentMonth]);

  useEffect(() => {
    if (!notification) return;
    const timeout = window.setTimeout(() => setNotification(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notification]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [profResult, aptResult, blockResult] = await Promise.all([
        supabase.from('profissionais').select('id, nome, especialidade, cnes').eq('cnes', profile?.cnes).order('nome', { ascending: true }),
        supabase
          .from('appointments')
          .select('id, date_time, status, notes, location, specialty, professional_name, patient_id, users(name, cpf)')
          .eq('location', profile?.cnes || '')
          .gte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString())
          .lte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString())
          .order('date_time', { ascending: true }),
        supabase
          .from('blocked_times')
          .select('id, date_time, location, specialty, professional_name, reason')
          .eq('location', profile?.cnes || '')
          .gte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString())
          .lte('date_time', new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString())
          .order('date_time', { ascending: true }),
      ]);
      if (profResult.error) throw profResult.error;
      if (aptResult.error) throw aptResult.error;
      if (blockResult.error) throw blockResult.error;

      setProfessionals(profResult.data || []);
      setAppointments((aptResult.data || []) as Appointment[]);
      setBlockedTimes((blockResult.data || []) as BlockedTime[]);

      if (profResult.data && profResult.data.length > 0 && !appointmentForm.professionalId) {
        setAppointmentForm((prev) => ({ ...prev, professionalId: profResult.data[0].id, location: profile?.cnes || '' }));
      }
    } catch (err) {
      console.error('Erro ao buscar agenda da recepção:', err);
      setNotification({ type: 'error', message: 'Erro ao buscar dados da agenda.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProfessionalId && professionals.length > 0) {
      const firstProfessional = professionals[0];
      setSelectedProfessionalId(firstProfessional.id);
      if (!appointmentForm.professionalId) {
        setAppointmentForm((prev) => ({
          ...prev,
          professionalId: firstProfessional.id,
          location: profile?.cnes || prev.location,
        }));
      }
    }
  }, [professionals, selectedProfessionalId, appointmentForm.professionalId, profile?.cnes]);

  const selectedProfessional = useMemo(() => {
    return selectedProfessionalId ? professionals.find((prof) => prof.id === selectedProfessionalId) || null : null;
  }, [professionals, selectedProfessionalId]);

  const professionalFilterText = selectedProfessional ? selectedProfessional.nome : '';

  useEffect(() => {
    if (selectedProfessional && !editingAppointment) {
      setAppointmentForm((prev) => ({ ...prev, professionalId: selectedProfessional.id }));
    }
  }, [selectedProfessional, editingAppointment]);

  const handleEditAppointment = (apt: Appointment) => {
    const patient = getPatientRecord(apt.users);
    const professional = professionals.find((prof) => prof.nome === apt.professional_name) || selectedProfessional;
    const aptDate = new Date(apt.date_time);
    const hours = String(aptDate.getHours()).padStart(2, '0');
    const minutes = String(aptDate.getMinutes()).padStart(2, '0');

    setEditingAppointment(apt);
    setSelectedPatient(patient);
    if (professional) {
      setSelectedProfessionalId(professional.id);
    }
    setAppointmentForm({
      professionalId: professional?.id || appointmentForm.professionalId,
      date: aptDate.toISOString().split('T')[0],
      time: `${hours}:${minutes}`,
      location: apt.location || '',
      notes: apt.notes || '',
      status: apt.status || 'scheduled',
    });
  };

  const handleCancelEdit = () => {
    setEditingAppointment(null);
    setSelectedPatient(null);
    setAppointmentForm((prev) => ({
      ...prev,
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      location: '',
      notes: '',
      status: 'scheduled',
    }));
  };

  const filteredAppointments = useMemo(() => {
    if (!professionalFilterText) return appointments;
    return appointments.filter((apt) => {
      const nameMatch = apt.professional_name?.toLowerCase().includes(professionalFilterText.toLowerCase());
      const specialtyMatch = apt.specialty?.toLowerCase().includes(professionalFilterText.toLowerCase());
      return nameMatch || specialtyMatch;
    });
  }, [appointments, professionalFilterText]);

  const filteredBlockedTimes = useMemo(() => {
    if (!professionalFilterText) return blockedTimes;
    return blockedTimes.filter((blk) => blk.professional_name?.toLowerCase().includes(professionalFilterText.toLowerCase()) || blk.specialty?.toLowerCase().includes(professionalFilterText.toLowerCase()));
  }, [blockedTimes, professionalFilterText]);

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

  const getPatientRecord = (users?: Patient | Patient[] | null) => {
    if (!users) return null;
    return Array.isArray(users) ? users[0] : users;
  };

  const handleSearchPatient = async () => {
    const cpfClean = patientSearch.replace(/\D/g, '');
    if (!cpfClean || cpfClean.length < 8) {
      setNotification({ type: 'error', message: 'Informe um CPF válido para buscar o paciente.' });
      return;
    }
    setPatientLoading(true);
    try {
      const { data, error } = await supabase.from('users').select('id, name, cpf').eq('cpf', cpfClean).single();
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
    if (!appointmentForm.professionalId) {
      setNotification({ type: 'error', message: 'Selecione um profissional.' });
      return;
    }
    const professional = professionals.find((prof) => prof.id === appointmentForm.professionalId);
    const dateTime = new Date(`${appointmentForm.date}T${appointmentForm.time}:00`).toISOString();
    try {
      setCreatingAppointment(true);
      const payload: any = {
        date_time: dateTime,
        status: appointmentForm.status,
        notes: appointmentForm.notes,
        location: appointmentForm.location || 'Não informado',
        specialty: professional?.especialidade || '',
        professional_name: professional?.nome || '',
        patient_id: selectedPatient.id,
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
    if (!window.confirm('Deseja excluir esta consulta?')) return;
    try {
      const { error } = await supabase.from('appointments').delete().eq('id', id);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Consulta excluída.' });
      fetchData();
    } catch (err: any) {
      console.error('Erro ao excluir consulta:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao excluir consulta.' });
    }
  };

  const handleToggleBlock = async () => {
    const alreadyBlocked = selectedDateBlocks.length > 0;
    if (selectedProfessionalId) {
      setNotification({ type: 'info', message: 'Selecione nenhum profissional para bloquear a data para toda a unidade.' });
      return;
    }

    if (alreadyBlocked) {
      if (!window.confirm('Deseja liberar o bloqueio desta data para toda a unidade?')) return;
      try {
        const ids = selectedDateBlocks.map((blk) => blk.id);
        const { error } = await supabase.from('blocked_times').delete().in('id', ids);
        if (error) throw error;
        setNotification({ type: 'success', message: 'Bloqueio liberado para a unidade.' });
        fetchData();
      } catch (err: any) {
        console.error('Erro ao desbloquear dia:', err);
        setNotification({ type: 'error', message: err.message || 'Erro ao desbloquear dia.' });
      }
      return;
    }

    const hasAppointments = filteredAppointments.some((apt) => {
      const aptDate = new Date(apt.date_time);
      return aptDate.getDate() === selectedDate.getDate() && aptDate.getMonth() === selectedDate.getMonth() && aptDate.getFullYear() === selectedDate.getFullYear();
    });

    if (hasAppointments) {
      setNotification({ type: 'error', message: 'Existem consultas agendadas nesta data na unidade. Revise ou remarque antes de bloquear.' });
      return;
    }

    try {
      setBlockingDate(true);
      const block = {
        date_time: new Date(`${selectedDate.toISOString().split('T')[0]}T00:00:00`).toISOString(),
        professional_name: 'TODOS',
        specialty: 'TODOS',
        location: profile?.cnes || 'Não informado',
        reason: blockReason || 'Bloqueio de unidade',
      };
      const { error } = await supabase.from('blocked_times').insert([block]);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Data bloqueada para todos os profissionais da unidade.' });
      fetchData();
    } catch (err: any) {
      console.error('Erro ao bloquear dia:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao bloquear dia.' });
    } finally {
      setBlockingDate(false);
    }
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
            {profile?.cnes ? `UBS CNES ${profile.cnes}` : 'Unidade não informada'}
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
            {notification && (
              <div className={`mb-6 rounded-lg border px-4 py-3 text-sm shadow ${notification.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : notification.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                {notification.message}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[2fr_1.2fr] gap-6">
          <section className="bg-white shadow rounded-lg p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Calendário da unidade</h2>
                <p className="text-sm text-gray-500">Clique em uma data para ver consultas e bloqueios.</p>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-3 w-full sm:w-auto">
                <div className="min-w-[240px]">
                  <label className="block text-sm font-medium text-gray-700">Filtro por profissional</label>
                  <select
                    value={selectedProfessionalId}
                    onChange={(e) => setSelectedProfessionalId(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                  >
                    <option value="">Nenhum profissional (bloquear data para toda a unidade)</option>
                    {professionals.map((prof) => (
                      <option key={prof.id} value={prof.id}>{prof.nome} {prof.especialidade ? `• ${prof.especialidade}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                    className="rounded-full border border-gray-200 p-2 hover:bg-gray-50"
                  >
                    ‹
                  </button>
                  <div className="text-sm font-semibold text-gray-700 first-letter:capitalize">{monthName}</div>
                  <button
                    type="button"
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                    className="rounded-full border border-gray-200 p-2 hover:bg-gray-50"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500 mb-2">
              <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {blanksArray.map((blank) => <div key={`blank-${blank}`} className="p-2" />)}
              {daysArray.map((day) => {
                const currentDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isSelected = selectedDate.getTime() === currentDate.getTime();
                const appointmentsCount = filteredAppointments.filter((apt) => {
                  const aptDate = new Date(apt.date_time);
                  return aptDate.getDate() === day && aptDate.getMonth() === currentMonth.getMonth() && aptDate.getFullYear() === currentMonth.getFullYear();
                }).length;
                const blocksCount = filteredBlockedTimes.filter((blk) => {
                  const blkDate = new Date(blk.date_time);
                  return blkDate.getDate() === day && blkDate.getMonth() === currentMonth.getMonth() && blkDate.getFullYear() === currentMonth.getFullYear();
                }).length;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDate(currentDate)}
                    className={`p-2 rounded-lg transition ${isSelected ? 'bg-green-600 text-white' : 'bg-gray-50 hover:bg-green-50'} ${currentDate < today ? 'opacity-80' : ''}`}
                  >
                    <div className="text-sm font-semibold">{day}</div>
                    <div className="mt-1 flex items-center justify-center gap-1">
                      {appointmentsCount > 0 && <span className="h-2 w-2 rounded-full bg-green-600" />}
                      {blocksCount > 0 && <span className="h-2 w-2 rounded-full bg-red-500" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-800">{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                    <p className="text-sm text-gray-500">{selectedDateAppointments.length} consultas | {selectedDateBlocks.length} bloqueios</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleBlock}
                    disabled={blockingDate}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${selectedDateBlocks.length > 0 ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    <Ban size={16} /> {blockingDate ? 'Processando...' : selectedDateBlocks.length > 0 ? 'Desbloquear dia' : 'Bloquear dia'}
                  </button>
                </div>
                {selectedDateBlocks.length > 0 && (
                  <div className="mt-3 text-sm text-gray-700">
                    <strong>Bloqueios registrados:</strong>
                    <ul className="mt-2 space-y-2">
                      {selectedDateBlocks.map((blk) => (
                        <li key={blk.id} className="rounded-md bg-white border border-red-200 p-3">
                          <div className="font-medium">{blk.professional_name || 'Profissional não informado'}</div>
                          <div className="text-gray-500">{blk.specialty || 'Especialidade não informada'} • {blk.location || 'Local não informado'}</div>
                          {blk.reason && <div className="text-sm text-gray-500 mt-1">Motivo: {blk.reason}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700">Motivo do bloqueio</label>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                    placeholder="Ex: Reunião da equipe ou plantão reduzido"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Consultas agendadas</h3>
                {selectedDateAppointments.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma consulta agendada para esta data.</p>
                ) : (
                  <ul className="space-y-3">
                    {selectedDateAppointments.map((apt) => {
                      const aptDate = new Date(apt.date_time);
                      return (
                        <li key={apt.id} className="rounded-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              {(() => {
                                const patient = getPatientRecord(apt.users);
                                return (
                                  <>
                                    <p className="font-semibold text-gray-800">{patient?.name || 'Paciente não identificado'}</p>
                                    <p className="text-sm text-gray-500">{patient?.cpf ? `CPF: ${patient.cpf}` : 'CPF não disponível'}</p>
                                  </>
                                );
                              })()}
                            </div>
                            <div className="text-right text-sm text-gray-500">
                              <p>{aptDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                              <p>{apt.professional_name || apt.specialty}</p>
                            </div>
                          </div>
                          {apt.location && <p className="mt-2 text-sm text-gray-600">Local: {apt.location}</p>}
                          {apt.notes && <p className="mt-2 text-sm text-gray-600 italic">Obs: {apt.notes}</p>}
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => handleEditAppointment(apt)} className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition">
                              <Edit size={14} /> Editar
                            </button>
                            <button onClick={() => handleDeleteAppointment(apt.id)} className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 transition">
                              <Trash2 size={14} /> Excluir
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            {selectedProfessionalId ? (
              <>
                <section className="bg-white shadow rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">{editingAppointment ? 'Editar consulta' : 'Agendar nova consulta'}</h2>
                      <p className="text-sm text-gray-500">Escolha profissional, paciente e horário.</p>
                    </div>
                    {editingAppointment && (
                      <button type="button" onClick={handleCancelEdit} className="text-sm text-gray-500 hover:text-gray-700">
                        Cancelar edição
                      </button>
                    )}
                  </div>
                  <form onSubmit={handleCreateAppointment} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Profissional</label>
                      <select
                        value={appointmentForm.professionalId}
                        onChange={(e) => setAppointmentForm({ ...appointmentForm, professionalId: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                        required
                      >
                        {professionals.map((prof) => (
                          <option key={prof.id} value={prof.id}>{prof.nome} • {prof.especialidade || 'Sem especialidade'}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Data</label>
                        <input
                          type="date"
                          value={appointmentForm.date}
                          onChange={(e) => setAppointmentForm({ ...appointmentForm, date: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Hora</label>
                        <input
                          type="time"
                          value={appointmentForm.time}
                          onChange={(e) => setAppointmentForm({ ...appointmentForm, time: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Local</label>
                      <input
                        type="text"
                        value={appointmentForm.location}
                        onChange={(e) => setAppointmentForm({ ...appointmentForm, location: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Paciente (CPF)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value.replace(/\D/g, '').slice(0, 11))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                          placeholder="00000000000"
                        />
                        <button type="button" onClick={handleSearchPatient} disabled={patientLoading} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition disabled:cursor-not-allowed disabled:opacity-60">
                          <Search size={16} /> {patientLoading ? 'Buscando...' : 'Buscar'}
                        </button>
                      </div>
                      {selectedPatient && (
                        <p className="mt-2 text-sm text-gray-600">Paciente selecionado: {selectedPatient.name} • CPF: {selectedPatient.cpf}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <select
                        value={appointmentForm.status}
                        onChange={(e) => setAppointmentForm({ ...appointmentForm, status: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                      >
                        <option value="scheduled">Agendada</option>
                        <option value="in_progress">Em andamento</option>
                        <option value="attended">Compareceu</option>
                        <option value="missed">Faltou</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Observações</label>
                      <textarea
                        value={appointmentForm.notes}
                        onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                        rows={4}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={creatingAppointment}
                      className="w-full inline-flex justify-center items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition"
                    >
                      <Plus size={16} /> {creatingAppointment ? (editingAppointment ? 'Salvando...' : 'Agendando...') : (editingAppointment ? 'Salvar alteração' : 'Agendar consulta')}
                    </button>
                  </form>
                </section>

                <section className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-800 mb-3">Profissional selecionado</h2>
                  {selectedProfessional ? (
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="font-semibold text-gray-800">{selectedProfessional.nome}</div>
                      <div className="text-sm text-gray-500">{selectedProfessional.especialidade || 'Especialidade não informada'}</div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Selecione um profissional para editar ou criar consultas.</p>
                  )}
                </section>
              </>
            ) : (
              <>
                <section className="bg-white shadow rounded-lg p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Bloquear data para toda a unidade</h2>
                    <p className="text-sm text-gray-500">Nenhum profissional selecionado. Escolha uma data e bloqueie para todos os profissionais desta UBS.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-700">Data selecionada: <strong>{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></p>
                      <p className="text-sm text-gray-500">Consultas nesta data: {selectedDateAppointments.length}</p>
                      {selectedDateAppointments.length > 0 && (
                        <p className="mt-2 text-sm text-red-600 font-medium">Existem consultas agendadas nesta data na unidade. Revise ou remarque antes de bloquear.</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Motivo do bloqueio</label>
                      <input
                        type="text"
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                        placeholder="Ex: Reunião da equipe ou plantão reduzido"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleBlock}
                      disabled={blockingDate}
                      className="w-full inline-flex justify-center items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Ban size={16} /> {blockingDate ? 'Processando...' : selectedDateBlocks.length > 0 ? 'Desbloquear data' : 'Bloquear data'}
                    </button>
                  </div>
                </section>

                <section className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-800 mb-3">Bloqueios na unidade</h2>
                  {selectedDateBlocks.length === 0 ? (
                    <p className="text-sm text-gray-500">Não há bloqueios para esta data.</p>
                  ) : (
                    <ul className="space-y-3">
                      {selectedDateBlocks.map((blk) => (
                        <li key={blk.id} className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                          <div className="font-semibold text-gray-800">{blk.professional_name}</div>
                          <div className="text-sm text-gray-500">{blk.specialty || 'Especialidade: Todos'} • {blk.location}</div>
                          {blk.reason && <p className="mt-2 text-sm text-gray-600">Motivo: {blk.reason}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </aside>
        </div>
      </>
    )}
      </main>
    </div>
  );
}
