import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CnesService, type CnesHorario } from '../lib/cnesService';
import { LogOut, Calendar, UserPlus, Clipboard, Clock } from 'lucide-react';

interface UnidadeInfo {
    name?: string;
    address?: string;
    phone?: string;
}

function formatPhone(phone?: string) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 9) {
        return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }
    if (digits.length === 8) {
        return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    }
    return phone;
}

function capitalizeText(value?: string) {
    if (!value) return '';
    return value
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

const getTodayHorario = (horarios: CnesHorario[], date: Date = new Date()) => {
    const dias = {
        1: 'Segunda-Feira',
        2: 'Terça-Feira',
        3: 'Quarta-Feira',
        4: 'Quinta-Feira',
        5: 'Sexta-Feira',
    } as const;

    const diaSemana = dias[date.getDay() as keyof typeof dias];
    if (!diaSemana) return 'Sem expediente';

    const hoje = horarios.find((horario) => horario.diaSemana === diaSemana);
    if (!hoje) return 'Sem expediente';

    return `${diaSemana} ${hoje.hrInicioAtendimento} - ${hoje.hrFimAtendimento}`;
};

export default function RecepcionistaDashboard() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [unitInfo, setUnitInfo] = useState<UnidadeInfo | null>(null);
    const [horariosUbs, setHorariosUbs] = useState<CnesHorario[]>([]);
    const [unitInfoLoading, setUnitInfoLoading] = useState(true);
    const [horariosLoading, setHorariosLoading] = useState(false);

    const handleLogout = () => supabase.auth.signOut();

    useEffect(() => {
        if (!profile?.cnes) {
            setUnitInfoLoading(false);
            return;
        }

        const fetchUnitInfo = async () => {
            setUnitInfoLoading(true);
            try {
                const { data, error } = await supabase
                    .from('cnes_establishments')
                    .select('*')
                    .eq('cnes_id', profile.cnes)
                    .single();

                if (!error && data) {
                    setUnitInfo(data as UnidadeInfo);
                }
            } catch (err) {
                console.error('Erro ao carregar informações da UBS:', err);
            } finally {
                setUnitInfoLoading(false);
            }
        };

        fetchUnitInfo();
    }, [profile?.cnes]);

    useEffect(() => {
        if (!profile?.ibge || !profile?.cnes) return;

        setHorariosLoading(true);
        CnesService.buscarHorariosFuncionamento(profile.ibge, profile.cnes)
            .then(setHorariosUbs)
            .catch((err) => {
                console.error('Erro ao carregar horários da UBS:', err);
            })
            .finally(() => setHorariosLoading(false));
    }, [profile?.ibge, profile?.cnes]);

    return (
        <div className="min-h-screen bg-gray-100">
            <nav className="bg-white shadow px-6 py-4 flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-800">Painel da Recepção</h1>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 font-medium">{profile?.nome}</span>
                    <button onClick={handleLogout} className="flex items-center gap-1 text-red-600 hover:text-red-800 cursor-pointer">
                        <LogOut size={18} /> Sair
                    </button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="bg-white shadow-sm rounded-xl border border-gray-100 p-6 mb-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Clock size={24} /></div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Horário e informações da unidade</h2>
                            <p className="text-sm text-gray-500">Visão rápida da UBS vinculada ao seu perfil.</p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                            <h3 className="text-sm font-medium text-gray-600">Unidade</h3>
                            <p className="mt-2 text-base font-semibold text-gray-900">
                                {unitInfoLoading ? 'Carregando...' : unitInfo?.name ? capitalizeText(unitInfo.name) : 'Não disponível'}
                            </p>
                        </div>
                        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                            <h3 className="text-sm font-medium text-gray-600">Horário</h3>
                            <p className="mt-2 text-base font-semibold text-gray-900">
                                {horariosLoading ? 'Carregando...' : getTodayHorario(horariosUbs)}
                            </p>
                        </div>
                        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                            <h3 className="text-sm font-medium text-gray-600">Contato</h3>
                            <p className="mt-2 text-base text-gray-900">
                                {unitInfoLoading ? 'Carregando...' : unitInfo?.phone ? formatPhone(unitInfo.phone) : 'Não disponível'}
                            </p>
                        </div>
                        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                            <h3 className="text-sm font-medium text-gray-600">Endereço</h3>
                            <p className="mt-2 text-base text-gray-900">
                                {unitInfoLoading ? 'Carregando...' : unitInfo?.address ? capitalizeText(unitInfo.address) : 'Não disponível'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <button onClick={() => navigate('/recepcionista/resumo')} className="h-full text-left bg-white p-6 rounded-lg shadow border-t-4 border-purple-500 hover:shadow-lg transition">
                        <div className="flex h-full flex-col justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Clipboard className="text-purple-500 h-8 w-8" />
                                <div>
                                    <h2 className="text-lg font-semibold">Resumo da UBS</h2>
                                    <p className="mt-2 text-gray-600">Veja horário de funcionamento, consultas de hoje e profissionais da unidade.</p>
                                </div>
                            </div>
                        </div>
                    </button>

                    <button onClick={() => navigate('/recepcionista/pacientes')} className="h-full text-left bg-white p-6 rounded-lg shadow border-t-4 border-green-500 hover:shadow-lg transition">
                        <div className="flex h-full flex-col justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <UserPlus className="text-green-500 h-8 w-8" />
                                <div>
                                    <h2 className="text-lg font-semibold">Gestão de Pacientes</h2>
                                    <p className="mt-2 text-gray-600">Cadastre, busque e edite pacientes.</p>
                                </div>
                            </div>
                        </div>
                    </button>

                    <button onClick={() => navigate('/recepcionista/agenda')} className="h-full text-left bg-white p-6 rounded-lg shadow border-t-4 border-blue-500 hover:shadow-lg transition">
                        <div className="flex h-full flex-col justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Calendar className="text-blue-500 h-8 w-8" />
                                <div>
                                    <h2 className="text-lg font-semibold">Agenda</h2>
                                    <p className="mt-2 text-gray-600">Selecione um profissional para carregar a agenda dele ou deixe em branco para bloquear datas da unidade.</p>
                                </div>
                            </div>
                        </div>
                    </button>
                </div>
            </main>
        </div>
    );
}