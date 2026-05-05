import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { LogOut, Activity, Calendar, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ProfissionalDashboard() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState({ total: 0, naFila: 0, emAtendimento: 0, atendidos: 0 });
    const [loading, setLoading] = useState(true);

    const handleLogout = () => supabase.auth.signOut();

    useEffect(() => {
        if (profile?.cns) fetchDashboardData();
    }, [profile]);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const hoje = new Date().toLocaleDateString('en-CA');

            const { data, error } = await supabase
                .from('appointments')
                .select('id, status')
                .eq('professional_cns', profile?.cns)
                .gte('date_time', `${hoje}T00:00:00`)
                .lte('date_time', `${hoje}T23:59:59`);

            if (error) throw error;

            const apts = data || [];
            setStats({
                total: apts.length,
                naFila: apts.filter(a => a.status === 'checked_in').length,
                emAtendimento: apts.filter(a => a.status === 'in_progress').length,
                atendidos: apts.filter(a => a.status === 'attended').length,
            });
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
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Atendimentos do Dia */}
                        <div 
                            onClick={() => navigate('/profissional/atendimentos')}
                            className="bg-white flex flex-col p-6 rounded-lg shadow border-t-4 border-green-500 cursor-pointer hover:shadow-lg transition"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <Activity className="text-green-500 h-8 w-8" />
                                <h2 className="text-lg font-semibold">Atendimentos do Dia</h2>
                            </div>
                            <p className="mt-2 text-gray-600 flex-grow">
                                {stats.total === 0 
                                    ? 'Nenhum atendimento agendado para hoje.'
                                    : (
                                        <>
                                            {stats.total} agendado{stats.total > 1 ? 's' : ''} hoje.
                                            {stats.naFila > 0 && <span className="block text-blue-600 font-medium mt-1">{stats.naFila} na fila de espera</span>}
                                            {stats.emAtendimento > 0 && <span className="block text-amber-600 font-medium">1 em atendimento</span>}
                                            {stats.atendidos > 0 && <span className="block text-green-600 font-medium">{stats.atendidos} atendido{stats.atendidos > 1 ? 's' : ''}</span>}
                                        </>
                                    )
                                }
                            </p>
                        </div>

                        {/* Agenda */}
                        <div 
                            onClick={() => navigate('/profissional/agenda')}
                            className="bg-white flex flex-col p-6 rounded-lg shadow border-t-4 border-indigo-500 cursor-pointer hover:shadow-lg transition"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <Calendar className="text-indigo-500 h-8 w-8" />
                                <h2 className="text-lg font-semibold">Agenda</h2>
                            </div>
                            <p className="mt-2 text-gray-600 flex-grow">
                                Visualize sua programação semanal, bloqueie dias e confira retornos.
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
