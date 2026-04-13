import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LogOut, Pill, ClipboardList } from 'lucide-react';

export default function FarmaciaDashboard() {
    const { profile } = useAuth();
    const handleLogout = () => supabase.auth.signOut();

    return (
        <div className="min-h-screen bg-gray-100">
            <nav className="bg-white shadow px-6 py-4 flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-800">Painel da Farmácia</h1>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 font-medium">Olá, {profile?.nome}</span>
                    <button onClick={handleLogout} className="flex items-center gap-1 text-red-600 hover:text-red-800 cursor-pointer">
                        <LogOut size={18} /> Sair
                    </button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 justify-center md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow border-t-4 border-orange-500 cursor-pointer hover:shadow-lg transition">
                        <div className="flex items-center gap-3">
                            <ClipboardList className="text-orange-500 h-8 w-8" />
                            <h2 className="text-lg font-semibold">Pedidos de Medicamentos</h2>
                        </div>
                        <p className="mt-2 text-gray-600">Acesse as prescrições médicas para efetuar a entrega.</p>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border-t-4 border-teal-500 cursor-pointer hover:shadow-lg transition">
                        <div className="flex items-center gap-3">
                            <Pill className="text-teal-500 h-8 w-8" />
                            <h2 className="text-lg font-semibold">Estoque</h2>
                        </div>
                        <p className="mt-2 text-gray-600">Controle o estoque de medicamentos de hipertensão e diabetes.</p>
                    </div>
                </div>
            </main>
        </div>
    );
}