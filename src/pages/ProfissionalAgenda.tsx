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
    
    const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    // Modal state
    const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
    const [blockForm, setBlockForm] = useState({
        date: '',
        startTime: '',
        endTime: '',
        location: '',
        specialty: '',
        professionalName: profile?.nome || '',
        reason: ''
    });
    const [isSubmittingBlock, setIsSubmittingBlock] = useState(false);

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

            // Set initial defaults for the block form based on the first appointment
            if (aptData && aptData.length > 0 && !blockForm.location) {
                setBlockForm(prev => ({
                    ...prev,
                    location: aptData[0].location || '',
                    specialty: aptData[0].specialty || ''
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

    const selectedDateAppointments = useMemo(() => {
        return appointments.filter(apt => {
            const aptDate = new Date(apt.date_time);
            return aptDate.getDate() === selectedDate.getDate() &&
                   aptDate.getMonth() === selectedDate.getMonth() &&
                   aptDate.getFullYear() === selectedDate.getFullYear();
        });
    }, [appointments, selectedDate]);

    const selectedDateBlocks = useMemo(() => {
        return blockedTimes.filter(blk => {
            const blkDate = new Date(blk.date_time);
            return blkDate.getDate() === selectedDate.getDate() &&
                   blkDate.getMonth() === selectedDate.getMonth() &&
                   blkDate.getFullYear() === selectedDate.getFullYear();
        });
    }, [blockedTimes, selectedDate]);

    const availableTimeOptions = useMemo(() => {
        let inicio = "07:00";
        let fim = "19:00";

        if (blockForm.date && horariosUbs.length > 0) {
            const d = new Date(blockForm.date + "T00:00:00");
            const diasMapping = ["DOMINGO", "SEGUNDA-FEIRA", "TERCA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SABADO"];
            const diaDaSemanaStr = diasMapping[d.getDay()];

            const horarioDoDia = horariosUbs.find(h => 
                (h.diaSemana?.toUpperCase() === diaDaSemanaStr) ||
                (h.diaSemana === String(d.getDay() + 1))
            );

            if (horarioDoDia && horarioDoDia.hrInicioAtendimento && horarioDoDia.hrFimAtendimento) {
                inicio = horarioDoDia.hrInicioAtendimento.substring(0, 5);
                fim = horarioDoDia.hrFimAtendimento.substring(0, 5);
            }
        }

        const opts = [];
        let [curH, curM] = inicio.split(':').map(Number);
        const [endH, endM] = fim.split(':').map(Number);

        while (curH < endH || (curH === endH && curM <= endM)) {
            const hs = curH.toString().padStart(2, '0');
            const ms = curM.toString().padStart(2, '0');
            opts.push(`${hs}:${ms}`);
            
            curM += 30;
            if (curM >= 60) {
                curM -= 60;
                curH++;
            }
        }
        return opts;
    }, [blockForm.date, horariosUbs]);

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay(); 
    
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanksArray = Array.from({ length: firstDayOfMonth }, (_, i) => i);
    const monthName = currentMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    const handleCreateBlock = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmittingBlock(true);
            const slots = [];
            
            let current = new Date(`${blockForm.date}T${blockForm.startTime}:00`);
            const end = new Date(`${blockForm.date}T${blockForm.endTime}:00`);

            while (current < end) {
                slots.push({
                    location: blockForm.location,
                    date_time: current.toISOString(),
                    specialty: blockForm.specialty,
                    professional_name: blockForm.professionalName,
                    reason: blockForm.reason || 'Horário Bloqueado'
                });
                current = new Date(current.getTime() + 30 * 60000); // add 30 mins
            }

            if (slots.length === 0) {
                alert('O horário de fim deve ser maior que o de início.');
                return;
            }

            const { error } = await supabase.from('blocked_times').insert(slots);
            if (error) throw error;

            alert('Horários bloqueados com sucesso!');
            setIsBlockModalOpen(false);
            fetchAgendaParaOMes(currentMonth);
            
        } catch (err: any) {
            console.error(err);
            alert('Erro ao bloquear horários: ' + err.message);
        } finally {
            setIsSubmittingBlock(false);
        }
    };

    const handleDeleteBlock = async (id: string) => {
        if (!confirm('Deseja realmente liberar este horário?')) return;
        try {
            const { error } = await supabase.from('blocked_times').delete().eq('id', id);
            if (error) throw error;
            fetchAgendaParaOMes(currentMonth);
        } catch (err) {
            console.error(err);
        }
    };

    const handleOpenBlockModal = () => {
        const d = selectedDate;
        const formattedDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        setBlockForm(prev => ({
            ...prev,
            date: formattedDate,
            startTime: '08:00',
            endTime: '12:00'
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Componente Calendário */}
                    <div className="bg-white p-4 shadow rounded-lg h-fit">
                        <div className="flex items-center justify-between mb-4">
                            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} /></button>
                            <h2 className="text-lg font-semibold text-gray-800 capitalize">{monthName}</h2>
                            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight size={20} /></button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium text-gray-500 mb-2">
                            <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center">
                            {blanksArray.map((b) => <div key={`blank-${b}`} className="p-2" />)}
                            {daysArray.map((day) => {
                                const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth.getMonth() && selectedDate.getFullYear() === currentMonth.getFullYear();
                                const hasApt = appointments.some(apt => new Date(apt.date_time).getDate() === day);
                                const hasBlock = blockedTimes.some(blk => new Date(blk.date_time).getDate() === day);
                                
                                return (
                                    <div 
                                        key={day} 
                                        onClick={() => setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))}
                                        className={`p-2 flex flex-col items-center justify-center cursor-pointer rounded-lg transition-colors aspect-square text-sm
                                            ${isSelected ? 'bg-green-600 text-white font-bold shadow-md' : 'text-gray-700 hover:bg-green-50'}
                                        `}
                                    >
                                        <span>{day}</span>
                                        <div className="flex gap-1 mt-1">
                                            {hasApt && <div className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-green-500'}`}></div>}
                                            {hasBlock && <div className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-red-200' : 'bg-red-500'}`}></div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Lista de Agendamentos do dia */}
                    <div className="bg-white shadow rounded-lg lg:col-span-2 overflow-hidden flex flex-col">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-md font-semibold text-gray-800 capitalize">
                                Consultas e Bloqueios: {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </h3>
                            <button 
                                onClick={handleOpenBlockModal}
                                className="flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded shadow hover:bg-red-700 transition text-sm">
                                <Ban size={16} />
                                <span className="hidden sm:inline">Bloquear Horários</span>
                            </button>
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
                                        const blkDate = new Date(blk.date_time);
                                        return (
                                            <li key={blk.id} className="p-6 hover:bg-red-50 transition bg-red-50/30">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center text-sm font-bold text-red-600">
                                                        <Ban className="mr-2 h-5 w-5 text-red-500" />
                                                        Horário Bloqueado
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                            Indisponível
                                                        </span>
                                                        <button onClick={() => handleDeleteBlock(blk.id)} className="text-xs text-red-600 underline hover:text-red-800">Liberar</button>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex flex-col gap-2 text-sm text-red-700">
                                                    <div className="flex items-center font-medium">
                                                        <Clock className="mr-2 h-4 w-4" />
                                                        {blkDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    {blk.reason && <div className="italic">Motivo: {blk.reason}</div>}
                                                </div>
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
                            <h2 className="text-xl font-bold text-gray-800">Bloquear Horário</h2>
                            <button onClick={() => setIsBlockModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateBlock} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Data *</label>
                                    <input 
                                        type="date" 
                                        required 
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-2 border" 
                                        value={blockForm.date}
                                        onChange={e => setBlockForm({...blockForm, date: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Hora Início *</label>
                                    <select 
                                        required 
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-2 border bg-white" 
                                        value={blockForm.startTime}
                                        onChange={e => setBlockForm({...blockForm, startTime: e.target.value})}
                                    >
                                        <option value="" disabled>Selecione...</option>
                                        {availableTimeOptions.map(t => <option key={`start-${t}`} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Hora Fim *</label>
                                    <select 
                                        required 
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-2 border bg-white" 
                                        value={blockForm.endTime}
                                        onChange={e => setBlockForm({...blockForm, endTime: e.target.value})}
                                    >
                                        <option value="" disabled>Selecione...</option>
                                        {availableTimeOptions.map(t => <option key={`end-${t}`} value={t}>{t}</option>)}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">Bloqueios em blocos de 30m.</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Nome do Profissional *</label>
                                    <input 
                                        type="text" 
                                        disabled
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border bg-gray-100 text-gray-500 cursor-not-allowed" 
                                        value={blockForm.professionalName}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Especialidade / UBS *</label>
                                    <input 
                                        type="text" 
                                        disabled
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border bg-gray-100 text-gray-500 cursor-not-allowed" 
                                        value={blockForm.specialty}
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Local (Unidade) *</label>
                                    <input 
                                        type="text" 
                                        disabled
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border bg-gray-100 text-gray-500 cursor-not-allowed" 
                                        value={blockForm.location}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Motivo do Bloqueio</label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: Horário de Almoço, Atestado..."
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
        </div>
    );
}