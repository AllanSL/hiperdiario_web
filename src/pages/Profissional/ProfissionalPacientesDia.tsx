import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { CnesService } from '../../lib/cnesService';
import { ArrowLeft, CalendarCheck, User, Clock, Activity, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ProfissionalPacientesDia() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [pacientes, setPacientes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (profile?.user_id) {
            fetchPacientesDoDia();
        }
    }, [profile]);

    const formatCPF = (v: string) => {
        const d = v.replace(/\D/g, '').slice(0, 11);
        if (d.length <= 3) return d;
        if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
        if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
    };

    const fetchPacientesDoDia = async () => {
        try {
            if (!profile?.cnes) return;
            setLoading(true);
            
            const hoje = new Date().toLocaleDateString('en-CA');

            const { data, error } = await supabase
                .from('appointments')
                .select(`
                    id, 
                    date_time,
                    status,
                    shift,
                    notes,
                    cnes_id,
                    patients ( name, cpf ),
                    cnes_establishments ( name )
                `)
                .eq('professional_cns', profile.cns)
                .gte('date_time', `${hoje}T00:00:00`)
                .lte('date_time', `${hoje}T23:59:59`)
                .order('date_time', { ascending: true });

            if (error) throw error;

            const pendentes = (data || []).filter(a => 
                a.status !== 'completed' && 
                a.status !== 'attended' && 
                a.status !== 'compareceu' &&
                a.status !== 'in_progress'
            );
            
            setPacientes(pendentes);
        } catch (err) {
            console.error('Erro ao buscar pacientes do dia:', err);
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
        return 'Agendado';
    };

    const getShiftLabel = (shift: string | null) => {
        if (shift === 'morning') return 'Manhã';
        if (shift === 'afternoon') return 'Tarde';
        return 'Não definido';
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <nav className="bg-white shadow px-6 py-4 flex items-center">
                <button onClick={() => navigate(-1)} className="mr-4 p-2 text-gray-600 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition">
                    <ArrowLeft size={24} />
                </button>
                <div className="flex items-center gap-3">
                    <CalendarCheck className="text-indigo-500 h-6 w-6" />
                    <h1 className="text-xl font-bold text-gray-800">Pacientes do Dia</h1>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
                {loading ? (
                    <div className="flex justify-center items-center py-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    </div>
                ) : (
                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        {pacientes.length === 0 ? (
                            <div className="p-6 text-center text-gray-500">
                                Nenhum paciente agendado para hoje.
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-200">
                                {pacientes.map((apt) => {
                                    return (
                                        <li key={apt.id}>
                                            <div className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center text-sm text-indigo-600 font-bold truncate">
                                                        <User className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" />
                                                        {apt.patients?.name || 'Paciente não identificado'}
                                                        {apt.patients?.cpf && (
                                                            <span className="ml-2 font-normal text-gray-500">
                                                                (CPF: {formatCPF(apt.patients.cpf)})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="ml-2 flex-shrink-0 flex items-center gap-2">
                                                        <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(apt.status)}`}>
                                                            {getStatusText(apt.status)}
                                                        </p>
                                                        {apt.status === 'scheduled' && (
                                                            <button className="flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded">
                                                                <Activity size={14} /> Atender
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-2 sm:flex sm:justify-between">
                                                    <div className="sm:flex flex-col gap-1 text-sm text-gray-500">
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center">
                                                                <Clock className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                                                Agendado para o turno: <strong className="ml-1 text-gray-700">{getShiftLabel(apt.shift)}</strong>
                                                            </div>
                                                            <div className="flex items-center">
                                                                <Home className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                                                Unidade: <strong className="ml-1 text-gray-700">{apt.cnes_establishments?.name ? CnesService.formatCnesDisplayName(apt.cnes_establishments.name) : (apt.cnes_id || 'Não informada')}</strong>
                                                            </div>
                                                        </div>
                                                        {apt.notes && (
                                                            <div className="mt-1 text-xs text-gray-400 border-l-2 border-gray-200 pl-2">
                                                                Motivo/Anotação: {apt.notes}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
