import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { LogOut, Activity, Calendar, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CnesService } from '../../lib/cnesService';

export default function ProfissionalDashboard() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState({ total: 0, naFila: 0, emAtendimento: 0, atendidos: 0 });
    const [unitName, setUnitName] = useState<string>('');
    const [loading, setLoading] = useState(true);

    const handleLogout = () => supabase.auth.signOut();

    useEffect(() => {
        if (profile?.cns) fetchDashboardData();
    }, [profile]);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const hoje = new Date().toLocaleDateString('en-CA');

            if (profile?.cnes) {
                const { data: ubsData } = await supabase.from('cnes_establishments').select('name').eq('cnes_id', profile.cnes).single();
                if (ubsData) {
                    setUnitName(CnesService.formatCnesDisplayName(ubsData.name));
                }
            }

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
        <div className="flex flex-col min-h-screen bg-gray-100 [scrollbar-gutter:stable]">
            <nav className="bg-white shadow px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-50 rounded-lg text-green-600">
                        <Activity size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Painel do Profissional</h1>
                        <p className="text-sm text-gray-500">Gestão de atendimentos e histórico clínico.</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4">
                    <div className="text-center sm:text-right text-sm text-gray-500 flex flex-col">
                        {unitName ? (
                            <span className="font-semibold text-gray-700">{unitName} <span className="font-normal text-gray-400 ml-1">CNES {profile?.cnes}</span></span>
                        ) : (
                            profile?.cnes ? `UBS CNES ${profile.cnes}` : 'Unidade não informada'
                        )}
                        <span className="text-xs font-medium text-green-600">{profile?.name} • {profile?.specialty}</span>
                    </div>
                    <button onClick={handleLogout} className="flex items-center gap-1 text-red-600 hover:text-red-800 cursor-pointer font-bold text-sm">
                        <LogOut size={18} /> Sair
                    </button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 w-full flex-grow">
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
