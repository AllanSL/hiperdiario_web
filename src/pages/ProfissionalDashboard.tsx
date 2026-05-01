import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LogOut, Activity, CalendarCheck, Calendar, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ProfissionalDashboard() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [pacientesDoDia, setPacientesDoDia] = useState<any[]>([]);
    const [atendimentoEmAndamento, setAtendimentoEmAndamento] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const handleLogout = () => supabase.auth.signOut();

    useEffect(() => {
        if (profile?.id) {
            fetchDashboardData();
        }
    }, [profile]);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const hoje = new Date().toISOString().split('T')[0];

            // Busca os agendamentos do dia para este profissional na tabela appointments
            const { data: appointments, error } = await supabase
                .from('appointments')
                .select(`
                    id, 
                    date_time,
                    status,
                    users ( name )
                `) // Relacionamento com a tabela users
                .ilike('specialty', `%${profile?.nome}%`) // O nome do profissional está contido na coluna specialty
                .gte('date_time', `${hoje}T00:00:00`)
                .lte('date_time', `${hoje}T23:59:59`);

            if (error) throw error;

            if (appointments) {
                // Filtra os que já estão agendados (pendentes) - Status prováveis: 'scheduled'
                const pendentes = appointments.filter(a => a.status !== 'in_progress' && a.status !== 'completed');
                setPacientesDoDia(pendentes);

                // Pega aquele que está em andamento, se houver
                const emAndamento = appointments.find(a => a.status === 'in_progress');
                setAtendimentoEmAndamento(emAndamento || null);
            }
        } catch (err) {
            console.error('Erro ao buscar dados do dashboard:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <nav className="bg-white shadow px-6 py-4 flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-800">Painel do Profissional de Saúde</h1>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 font-medium">{profile?.nome}</span>
                    <button onClick={handleLogout} className="flex items-center gap-1 text-red-600 hover:text-red-800 cursor-pointer">
                        <LogOut size={18} /> Sair
                    </button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {loading ? (
                    <div className="flex justify-center items-center py-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Pacientes do Dia */}
                        <div 
                            onClick={() => navigate('/profissional/pacientes-dia')}
                            className="bg-white flex flex-col p-6 rounded-lg shadow border-t-4 border-indigo-500 cursor-pointer hover:shadow-lg transition"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <CalendarCheck className="text-indigo-500 h-8 w-8" />
                                <h2 className="text-lg font-semibold">Pacientes do Dia</h2>
                            </div>
                            <p className="mt-2 text-gray-600 flex-grow">
                                {pacientesDoDia.length > 0 
                                    ? `Você tem ${pacientesDoDia.length} atendimento(s) agendado(s) hoje.` 
                                    : "Não há pacientes agendados para hoje."}
                            </p>
                        </div>

                        {/* Atendimento em Andamento */}
                        <div className="bg-white flex flex-col p-6 rounded-lg shadow border-t-4 border-red-500 cursor-pointer hover:shadow-lg transition">
                            <div className="flex items-center gap-3 mb-2">
                                <Activity className="text-red-500 h-8 w-8" />
                                <h2 className="text-lg font-semibold">Atendimento em Andamento</h2>
                            </div>
                            <p className="mt-2 text-gray-600 flex-grow">
                                {atendimentoEmAndamento 
                                    ? `Atendendo agora: ${atendimentoEmAndamento.users?.name || 'Paciente Atual'}`
                                    : "Nenhum atendimento em andamento no momento."}
                            </p>
                        </div>

                        {/* Agenda - Nova Opção */}
                        <div 
                            onClick={() => navigate('/profissional/agenda')}
                            className="bg-white flex flex-col p-6 rounded-lg shadow border-t-4 border-green-500 cursor-pointer hover:shadow-lg transition"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <Calendar className="text-green-500 h-8 w-8" />
                                <h2 className="text-lg font-semibold">Agenda</h2>
                            </div>
                            <p className="mt-2 text-gray-600 flex-grow">
                                Visualize sua programação semanal, bloqueie horários e confira retornos.
                            </p>
                        </div>

                        {/* Pacientes */}
                        <div 
                            onClick={() => navigate('/profissional/pacientes')}
                            className="bg-white flex flex-col p-6 rounded-lg shadow border-t-4 border-purple-500 cursor-pointer hover:shadow-lg transition"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <Users className="text-purple-500 h-8 w-8" />
                                <h2 className="text-lg font-semibold">Pacientes</h2>
                            </div>
                            <p className="mt-2 text-gray-600 flex-grow">
                                Procure e liste pacientes, veja seus medicamentos e edite suas doenças.
                            </p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}