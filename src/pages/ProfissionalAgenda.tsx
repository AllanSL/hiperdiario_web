import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CnesService, type CnesHorario } from '../lib/cnesService';
import { ArrowLeft, Calendar, User, Clock, ChevronLeft, ChevronRight, Ban, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ProfissionalAgenda() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState<any[]>([]);
    const [blockedTimes, setBlockedTimes] = useState<any[]>([]);
    const [horariosUbs, setHorariosUbs] = useState<CnesHorario[]>([]);
    const [loading, setLoading] = useState(true);
    const [ubsName, setUbsName] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    
    const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    useEffect(() => {
        if (!notification) return;

        const timeout = window.setTimeout(() => {
            setNotification(null);
        }, 5000);

        return () => window.clearTimeout(timeout);
    }, [notification]);

    // Modal state
    const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
    const [isUnblockModalOpen, setIsUnblockModalOpen] = useState(false);
    const [blockForm, setBlockForm] = useState({
        date: '',
        location: '',
        specialty: '',
        professionalName: profile?.nome || '',
        reason: ''
    });
    const [isSubmittingBlock, setIsSubmittingBlock] = useState(false);
    const [isSubmittingUnblock, setIsSubmittingUnblock] = useState(false);

    useEffect(() => {
        if (profile?.id) {
            fetchAgendaParaOMes(currentMonth);
            if (profile.ibge && profile.cnes) {
                CnesService.buscarHorariosFuncionamento(profile.ibge, profile.cnes)
                    .then(setHorariosUbs)
                    .catch(console.error);
            }
        }
    }, [profile, currentMonth]);

    useEffect(() => {
        if (!profile?.cnes) return;

        const fetchUbsName = async () => {
            const { data } = await supabase
                .from('cnes_establishments')
                .select('name')
                .eq('cnes_id', profile.cnes)
                .single();

            if (data?.name) {
                setUbsName(data.name);
            }
        };

        fetchUbsName().catch(console.error);
    }, [profile?.cnes]);

    useEffect(() => {
        if (!profile) return;
        setBlockForm(prev => ({
            ...prev,
            professionalName: profile.nome || prev.professionalName,
            specialty: prev.specialty || profile.especialidade || prev.specialty,
        }));
    }, [profile]);

    const fetchAgendaParaOMes = async (monthDate: Date) => {
        try {
            setLoading(true);
            const y = monthDate.getFullYear();
            const m = monthDate.getMonth();
            const startDate = new Date(Date.UTC(y, m, 1, 0, 0, 0)).toISOString();
            const endDate = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)).toISOString();

            // Buscar Appointments
            const { data: aptData, error: aptError } = await supabase
                .from('appointments')
                .select(`
                    id, 
                    date_time,
                    status,
                    notes,
                    location,
                    specialty,
                    users ( name, cpf )
                `)
                .ilike('specialty', `%${profile?.nome}%`)
                .gte('date_time', startDate)
                .lte('date_time', endDate)
                .order('date_time', { ascending: true });

            if (aptError) throw aptError;
            setAppointments(aptData || []);

            // Set initial defaults for the block form based on profile or the first appointment
            if (aptData && aptData.length > 0 && (!blockForm.location || !blockForm.specialty)) {
                setBlockForm(prev => ({
                    ...prev,
                    location: aptData[0].location || prev.location || '',
                    specialty: prev.specialty || profile?.especialidade || aptData[0].specialty || ''
                }));
            }

            // Buscar Blocked Times
            const { data: blockData, error: blockError } = await supabase
                .from('blocked_times')
                .select('*')
                .ilike('professional_name', `%${profile?.nome}%`)
                .gte('date_time', startDate)
                .lte('date_time', endDate)
                .order('date_time', { ascending: true });

            if (blockError) throw blockError;
            setBlockedTimes(blockData || []);

        } catch (err) {
            console.error('Erro ao buscar agenda:', err);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string | null) => {
        const s = status?.toLowerCase();
        if (s === 'attended' || s === 'compareceu') return 'bg-green-100 text-green-800';
        if (s === 'missed' || s === 'faltou') return 'bg-red-100 text-red-800';
        return 'bg-blue-100 text-blue-800';
    };

    const getStatusText = (status: string | null) => {
        const s = status?.toLowerCase();
        if (s === 'attended' || s === 'compareceu') return 'Compareceu';
        if (s === 'missed' || s === 'faltou') return 'Faltou';
        return 'Agendada';
    };

    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));

    const selectedDateBlocks = useMemo(() => {
        return blockedTimes.filter(blk => {
            const blkDate = new Date(blk.date_time);
            return blkDate.getDate() === selectedDate.getDate() &&
                   blkDate.getMonth() === selectedDate.getMonth() &&
                   blkDate.getFullYear() === selectedDate.getFullYear();
        });
    }, [blockedTimes, selectedDate]);

    const getScheduleForDate = (date: Date) => {
        const daysMapping = ["DOMINGO", "SEGUNDA-FEIRA", "TERCA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SABADO"];
        const dayName = daysMapping[date.getDay()];

        const horario = horariosUbs.find(h => {
            if (!h.diaSemana) return false;
            const normalizedDia = h.diaSemana.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
            return normalizedDia === dayName || normalizedDia.includes(dayName) || h.diaSemana === String(date.getDay() + 1);
        });

        if (!horario || !horario.hrInicioAtendimento || !horario.hrFimAtendimento) {
            if (date.getDay() === 0 || date.getDay() === 6) return null;
            return { hrInicioAtendimento: '07:00', hrFimAtendimento: '17:00' };
        }

        return horario;
    };

    const getCapacityForDate = (date: Date) => {
        const schedule = getScheduleForDate(date);
        if (!schedule) return 0;

        const parse = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const startMinutes = parse(schedule.hrInicioAtendimento.substring(0, 5));
        const endMinutes = parse(schedule.hrFimAtendimento.substring(0, 5));
        const totalMinutes = Math.max(0, endMinutes - startMinutes);
        return Math.floor(totalMinutes / 30);
    };

    const selectedDateCapacity = useMemo(() => getCapacityForDate(selectedDate), [selectedDate, horariosUbs]);

    const selectedDateAppointments = useMemo(() => {
        return appointments.filter(apt => {
            const aptDate = new Date(apt.date_time);
            return aptDate.getDate() === selectedDate.getDate() &&
                   aptDate.getMonth() === selectedDate.getMonth() &&
                   aptDate.getFullYear() === selectedDate.getFullYear();
        });
    }, [appointments, selectedDate]);

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay(); 
    
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanksArray = Array.from({ length: firstDayOfMonth }, (_, i) => i);
    const monthName = currentMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    const handleCreateBlock = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!blockForm.date) {
            setNotification({ type: 'error', message: 'Por favor, selecione uma data para bloqueio.' });
            return;
        }

        const [year, month, day] = blockForm.date.split('-').map(Number);
        const targetDate = new Date(year, month - 1, day);
        const blockExists = blockedTimes.some(blk => {
            const blkDate = new Date(blk.date_time);
            return blkDate.getDate() === targetDate.getDate() &&
                   blkDate.getMonth() === targetDate.getMonth() &&
                   blkDate.getFullYear() === targetDate.getFullYear() &&
                   blk.professional_name === blockForm.professionalName &&
                   blk.location === (blockForm.location || 'Não informado') &&
                   blk.specialty === (blockForm.specialty || '');
        });

        if (blockExists) {
            setNotification({ type: 'error', message: 'Já existe um bloqueio para este dia e esta especialidade/profissional. Libere o bloqueio existente antes de criar outro.' });
            return;
        }

        try {
            setIsSubmittingBlock(true);
            const block = {
                location: blockForm.location || 'Não informado',
                date_time: new Date(`${blockForm.date}T00:00:00`).toISOString(),
                specialty: blockForm.specialty || '',
                professional_name: blockForm.professionalName,
                reason: blockForm.reason || 'Dia Bloqueado'
            };

            const { error } = await supabase.from('blocked_times').insert([block]);
            if (error) throw error;

            setNotification({ type: 'success', message: 'Dia bloqueado com sucesso!' });
            setIsBlockModalOpen(false);
            fetchAgendaParaOMes(currentMonth);
            
        } catch (err: any) {
            console.error(err);
            setNotification({ type: 'error', message: 'Erro ao bloquear o dia: ' + err.message });
        } finally {
            setIsSubmittingBlock(false);
        }
    };

    const handleToggleBlock = async () => {
        if (selectedDateBlocks.length === 0) {
            handleOpenBlockModal();
            return;
        }

        setIsUnblockModalOpen(true);
    };

    const confirmUnblockDay = async () => {
        try {
            setIsSubmittingUnblock(true);
            const ids = selectedDateBlocks.map(blk => blk.id);
            const { error } = await supabase.from('blocked_times').delete().in('id', ids);
            if (error) throw error;
            fetchAgendaParaOMes(currentMonth);
            setIsUnblockModalOpen(false);
        } catch (err: any) {
            console.error(err);
            setNotification({ type: 'error', message: 'Erro ao liberar o dia: ' + err.message });
        } finally {
            setIsSubmittingUnblock(false);
        }
    };

    const handleOpenBlockModal = () => {
        const d = selectedDate;
        const formattedDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        
        let initialLocation = blockForm.location || ubsName || profile?.cnes || '';
        const initialSpecialty = blockForm.specialty || profile?.especialidade || '';

        // Try getting location from appointments if not available
        if (!initialLocation && appointments.length > 0) {
            initialLocation = appointments[0].location || '';
        }
        
        setBlockForm(prev => ({
            ...prev,
            date: formattedDate,
            location: initialLocation,
            specialty: initialSpecialty,
            professionalName: profile?.nome || prev.professionalName,
            reason: ''
        }));
        setIsBlockModalOpen(true);
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-100">
            <nav className="bg-white shadow px-6 py-4 flex items-center">
                <button onClick={() => navigate(-1)} className="mr-4 p-2 text-gray-600 hover:text-green-600 hover:bg-gray-100 rounded-full transition">
                    <ArrowLeft size={24} />
                </button>
                <div className="flex items-center gap-3">
                    <Calendar className="text-green-500 h-6 w-6" />
                    <h1 className="text-xl font-bold text-gray-800">Minha Agenda</h1>
                </div>
            </nav>

            <main className="max-w-6xl mx-auto py-6 sm:px-6 lg:px-8 w-full flex-grow">
                {notification && (
                    <div className={`mx-auto mb-6 max-w-2xl rounded-lg border px-4 py-3 text-sm shadow ${notification.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : notification.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                        <div className="flex items-start justify-between gap-4">
                            <p className="flex-1">{notification.message}</p>
                            <button type="button" onClick={() => setNotification(null)} className="text-current opacity-70 hover:opacity-100">✕</button>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Componente Calendário */}
                    <div className="bg-white p-4 shadow rounded-lg h-fit">
                        <div className="flex items-center justify-between mb-4">
                            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} /></button>
                            <h2 className="text-lg font-semibold text-gray-800 first-letter:capitalize">{monthName}</h2>
                            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight size={20} /></button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium text-gray-500 mb-2">
                            <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center">
                            {blanksArray.map((b) => <div key={`blank-${b}`} className="p-2" />)}
                            {daysArray.map((day) => {
                                const currentDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                                const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
                                
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const isPastDate = currentDate < today;
                                
                                const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth.getMonth() && selectedDate.getFullYear() === currentMonth.getFullYear();
                                const hasApt = appointments.some(apt => new Date(apt.date_time).getDate() === day);
                                const hasBlock = blockedTimes.some(blk => new Date(blk.date_time).getDate() === day);
                                
                                const isUnavailable = isWeekend; // Removemos isPastDate para permitir clique em datas passadas

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
                                            {hasApt && <div className={`h-1.5 w-1.5 rounded-full ${isSelected && !isUnavailable ? 'bg-white' : 'bg-green-500'}`}></div>}
                                            {hasBlock && <div className={`h-1.5 w-1.5 rounded-full ${isSelected && !isUnavailable ? 'bg-red-200' : 'bg-red-500'}`}></div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Lista de Agendamentos do dia */}
                    <div className="bg-white shadow rounded-lg lg:col-span-2 overflow-hidden flex flex-col">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                            <div>
                                <h3 className="text-md font-semibold text-gray-800 ">
                                    Consultas e bloqueios: {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                </h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    {selectedDateBlocks.length > 0 ? 'Dia bloqueado para atendimento.' : `Atendimentos agendados: ${selectedDateAppointments.length} de ${selectedDateCapacity}`}
                                    {selectedDateCapacity > 0 && selectedDateAppointments.length >= selectedDateCapacity ? ' — limite atingido' : ''}
                                </p>
                            </div>
                            {(() => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const isPastSelected = selectedDate < today;
                                
                                return (
                                    <button 
                                        onClick={handleToggleBlock}
                                        disabled={isPastSelected}
                                        className={`flex items-center gap-2 ${selectedDateBlocks.length > 0 ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-red-600 hover:bg-red-700'} text-white px-3 py-1.5 rounded shadow transition text-sm ${isPastSelected ? 'invisible' : ''}`}>
                                        <Ban size={16} />
                                        <span className="hidden sm:inline">{selectedDateBlocks.length > 0 ? 'Desbloquear dia' : 'Bloquear dia'}</span>
                                    </button>
                                );
                            })()}
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="flex justify-center items-center h-32">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                                </div>
                            ) : (selectedDateAppointments.length === 0 && selectedDateBlocks.length === 0) ? (
                                <div className="p-10 text-center text-gray-500">
                                    Nenhum registro para esta data.
                                </div>
                            ) : (
                                <ul className="divide-y divide-gray-200 m-0 p-0">
                                    {/* Mostrar bloqueios primeiro */}
                                    {selectedDateBlocks.map((blk) => {
                                        return (
                                            <li key={blk.id} className="p-6 hover:bg-red-50 transition bg-red-50/30">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center text-sm font-bold text-red-600">
                                                        <Ban className="mr-2 h-5 w-5 text-red-500" />
                                                        Dia Bloqueado
                                                    </div>
                                                </div>
                                                {blk.reason && blk.reason !== 'Dia Bloqueado' ? (
                                                    <div className="mt-3 text-sm text-red-700 italic">Motivo: {blk.reason}</div>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                    
                                    {/* Mostrar agendamentos normais */}
                                    {selectedDateAppointments.map((apt) => {
                                        const aptDate = new Date(apt.date_time);
                                        return (
                                            <li key={apt.id} className="p-6 hover:bg-gray-50 transition">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center text-sm font-bold text-indigo-600">
                                                        <User className="mr-2 h-5 w-5 text-gray-400" />
                                                        {apt.users?.name || 'Paciente não identificado'} 
                                                        {apt.users?.cpf && <span className="ml-2 font-normal text-gray-500">(CPF: {apt.users.cpf})</span>}
                                                    </div>
                                                    <div>
                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(apt.status)}`}>
                                                            {getStatusText(apt.status)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex flex-col gap-2 text-sm text-gray-600">
                                                    <div className="flex items-center text-gray-800 font-medium">
                                                        <Clock className="mr-2 h-4 w-4 text-green-500" />
                                                        {aptDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    {apt.location && <div>Local: {apt.location}</div>}
                                                    {apt.notes && <div className="italic break-words">Obs: {apt.notes}</div>}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* MODAL DE BLOQUEIO DE HORÁRIOS */}
            {isBlockModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-200">
                            <h2 className="text-xl font-bold text-gray-800">Bloquear dia</h2>
                            <button onClick={() => setIsBlockModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateBlock} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700">Data *</label>
                                        <input 
                                            type="date" 
                                            min={new Date().toISOString().split('T')[0]}
                                            required 
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-2 border" 
                                            value={blockForm.date}
                                            onChange={e => setBlockForm({...blockForm, date: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Nome do Profissional *</label>
                                    <div className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 bg-gray-100 p-3 text-gray-700 break-words whitespace-normal">
                                        {blockForm.professionalName || 'Não informado'}
                                    </div>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Especialidade</label>
                                    <div className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 bg-gray-100 p-3 text-gray-700 break-words whitespace-normal">
                                        {blockForm.specialty || 'Não informado'}
                                    </div>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Unidade</label>
                                    <input 
                                        type="text" 
                                        disabled
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border bg-gray-100 text-gray-500 cursor-not-allowed" 
                                        value={blockForm.location || 'Não informado'}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Motivo do Bloqueio</label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: Feriado, Atestado..."
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-2 border" 
                                    value={blockForm.reason}
                                    onChange={e => setBlockForm({...blockForm, reason: e.target.value})}
                                />
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-200">
                                <button 
                                    type="button" 
                                    onClick={() => setIsBlockModalOpen(false)}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmittingBlock}
                                    className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md transition disabled:opacity-50"
                                >
                                    {isSubmittingBlock ? 'Bloqueando...' : 'Confirmar Bloqueio'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isUnblockModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-200">
                            <h2 className="text-xl font-bold text-gray-800">Desbloquear dia</h2>
                            <button onClick={() => setIsUnblockModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-700">
                                Tem certeza que deseja liberar o bloqueio para {selectedDate.toLocaleDateString('pt-BR')}?
                            </p>
                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-200">
                                <button 
                                    type="button"
                                    onClick={() => setIsUnblockModalOpen(false)}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="button"
                                    onClick={confirmUnblockDay}
                                    disabled={isSubmittingUnblock}
                                    className="px-4 py-2 text-white bg-yellow-500 hover:bg-yellow-600 rounded-md transition disabled:opacity-50"
                                >
                                    {isSubmittingUnblock ? 'Liberando...' : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}