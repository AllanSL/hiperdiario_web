import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LogOut, Activity, CalendarCheck } from 'lucide-react';

export default function ProfissionalDashboard() {
    const { profile } = useAuth();
    const handleLogout = () => supabase.auth.signOut();

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow border-t-4 border-indigo-500 cursor-pointer hover:shadow-lg transition">
                        <div className="flex items-center gap-3">
                            <CalendarCheck className="text-indigo-500 h-8 w-8" />
                            <h2 className="text-lg font-semibold">Pacientes do Dia</h2>
                        </div>
                        <p className="mt-2 text-gray-600">Veja a lista de pacientes agendados para hoje.</p>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border-t-4 border-red-500 cursor-pointer hover:shadow-lg transition">
                        <div className="flex items-center gap-3">
                            <Activity className="text-red-500 h-8 w-8" />
                            <h2 className="text-lg font-semibold">Atendimento em Andamento</h2>
                        </div>
                        <p className="mt-2 text-gray-600">Registre dados aferidos, anote histórico e conclua a consulta.</p>
                    </div>
                </div>
            </main>
        </div>
    );
}