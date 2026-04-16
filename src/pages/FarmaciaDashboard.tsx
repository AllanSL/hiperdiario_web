import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LogOut, Pill, ClipboardList, Search, Plus, Calendar, AlertCircle, X, CheckCircle, PackageSearch, History } from 'lucide-react';
import { CustomSelect } from '../components/CustomSelect';

interface Medicine {
    id: string;
    active_principle: string;
    strength: string;
    form: string;
    category: string;
    dispensing_unit: string;
    reference_box_qty: number;
}

interface Patient {
    id: string | number;
    cpf: string;
    name: string;
    conditions?: string[]; // Array de condições (ex: ['Diabetes Tipo 1', 'Hipertensão'])
}

function FarmaciaEstoque({ cnes, catalog }: { cnes: string; catalog: Medicine[] }) {
    const [inventory, setInventory] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    
    // Filters
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [stockFilter, setStockFilter] = useState('all'); // 'all', 'in_stock', 'out_of_stock'

    const availableCategories = useMemo(() => {
        return Array.from(new Set(catalog.map(c => c.category))).sort();
    }, [catalog]);

    useEffect(() => {
        if (!cnes) return;

        const fetchInventory = async () => {
            const { data } = await supabase.from('pharmacy_inventory').select('catalog_id, quantity_in_stock').eq('ubs_cnes', cnes);
            if (data) {
                const map: Record<string, number> = {};
                data.forEach(item => {
                    map[item.catalog_id] = item.quantity_in_stock;
                });
                setInventory(map);
            }
            setLoading(false);
        };
        fetchInventory();
    }, [cnes]);

    const handleUpdateStock = async (med: Medicine, changeRaw: string) => {
        if (!changeRaw || isNaN(Number(changeRaw))) return;
        const quantity = Number(changeRaw);
        setUpdating(med.id);
        try {
            const currentStock = inventory[med.id] || 0;
            const newStock = Math.max(0, currentStock + quantity);

            const { error } = await supabase.from('pharmacy_inventory').upsert(
                { ubs_cnes: cnes, catalog_id: med.id, quantity_in_stock: newStock, last_updated_at: new Date().toISOString() },
                { onConflict: 'ubs_cnes, catalog_id' }
            );

            if (!error) {
                setInventory(prev => ({ ...prev, [med.id]: newStock }));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setUpdating(null);
        }
    };

    const filtered = catalog.filter(m => {
        const matchSearch = m.active_principle.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase());
        const matchCat = categoryFilter === '' || m.category === categoryFilter;
        
        const stock = inventory[m.id] || 0;
        let matchStock = true;
        if (stockFilter === 'in_stock') matchStock = stock > 0;
        if (stockFilter === 'out_of_stock') matchStock = stock === 0;

        return matchSearch && matchCat && matchStock;
    });

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-teal-50 text-teal-600 rounded-lg"><PackageSearch size={24} /></div>
                    <h3 className="text-lg font-semibold">Gerenciar Estoque</h3>
                </div>
                
                <div className="flex flex-col md:flex-row items-center gap-3">
                    <select 
                        value={stockFilter} 
                        onChange={e => setStockFilter(e.target.value)}
                        className="w-full md:w-auto border border-gray-200 rounded-lg p-2 text-sm focus:ring-1 focus:ring-teal-500 outline-none bg-white"
                    >
                        <option value="all">Todos os status</option>
                        <option value="in_stock">Com saldo em estoque</option>
                        <option value="out_of_stock">Sem saldo (Zerado)</option>
                    </select>

                    <select 
                        value={categoryFilter} 
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="w-full md:w-auto border border-gray-200 rounded-lg p-2 text-sm focus:ring-1 focus:ring-teal-500 outline-none bg-white"
                    >
                        <option value="">Todas as categorias</option>
                        {availableCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>

                    <div className="relative w-full md:w-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" placeholder="Buscar medicamento..." 
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-teal-500 outline-none w-full md:w-64 bg-white"
                        />
                    </div>
                </div>
            </div>

            {loading ? <p className="text-gray-500 italic">Carregando catálogo e estoque...</p> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-sm text-gray-600">
                                <th className="p-3 font-medium rounded-tl-lg">Medicamento</th>
                                <th className="p-3 font-medium w-[20%]">Categoria / Forma</th>
                                <th className="p-3 font-medium text-center">Último Saldo</th>
                                <th className="p-3 font-medium rounded-tr-lg w-64">Entrada/Ajuste (+/-)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.length === 0 ? (
                                <tr><td colSpan={4} className="p-6 text-center text-gray-500">Nenhum medicamento encontrado nos filtros selecionados.</td></tr>
                            ) : (
                                filtered.map(med => {
                                    const stock = inventory[med.id] || 0;
                                    return (
                                        <tr key={med.id} className="hover:bg-gray-50">
                                            <td className="p-3">
                                                <p className="font-medium text-gray-900 text-sm">{med.active_principle} {med.strength}</p>
                                            </td>
                                            <td className="p-3 text-sm text-gray-500">{med.category} • {med.form}</td>
                                            <td className={`p-3 text-center font-bold ${stock <= 0 ? 'text-red-500' : stock < 50 ? 'text-orange-500' : 'text-green-600'}`}>
                                                {stock} <span className="text-xs font-normal text-gray-500 ml-1">{med.dispensing_unit}</span>
                                            </td>
                                            <td className="p-3">
                                                <form onSubmit={(e) => { e.preventDefault(); const target = e.target as any; handleUpdateStock(med, target.elements.change.value); target.reset(); }} className="flex items-center gap-2">
                                                    <input name="change" type="number" placeholder="Ex: 100 ou -10" disabled={updating === med.id} className="w-32 border border-gray-200 p-1.5 px-3 rounded-lg text-sm text-center outline-none focus:border-teal-500 bg-white" />
                                                    <button type="submit" disabled={updating === med.id} className="bg-teal-100 hover:bg-teal-200 text-teal-700 px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50">
                                                        {updating === med.id ? '...' : 'Salvar'}
                                                    </button>
                                                </form>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function FarmaciaHistorico({ cnes }: { cnes: string }) {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!cnes) return;

        const fetchHistory = async () => {
            const { data } = await supabase
                .from('medicine_dispensations')
                .select('id, dispensed_at, dispensed_quantity, prescribing_doctor, ubs_cnes, users!medicine_dispensations_patient_id_fkey(name, cpf), medicine_catalog(active_principle, strength, dispensing_unit)')
                .eq('ubs_cnes', cnes)
                .order('dispensed_at', { ascending: false })
                .limit(50);
            
            if (data) setHistory(data);
            setLoading(false);
        };
        fetchHistory();
    }, [cnes]);

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-teal-50 text-teal-600 rounded-lg"><History size={24} /></div>
                <h3 className="text-lg font-semibold">Últimas Retiradas</h3>
            </div>
            
            {loading ? <p className="text-gray-500 italic">Buscando histórico...</p> : history.length === 0 ? <p className="text-gray-500 italic">Nenhuma retirada registrada ainda.</p> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-sm text-gray-600">
                                <th className="p-3 font-medium">Data/Hora</th>
                                <th className="p-3 font-medium">Paciente</th>
                                <th className="p-3 font-medium">Medicamento Retirado</th>
                                <th className="p-3 font-medium">Qtd.</th>
                                <th className="p-3 font-medium">Prescritor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {history.map(row => (
                                <tr key={row.id} className="hover:bg-gray-50 text-sm">
                                    <td className="p-3 text-gray-600 whitespace-nowrap">{new Date(row.dispensed_at).toLocaleString('pt-BR')}</td>
                                    <td className="p-3 font-medium text-gray-800">{row.users?.name}<br/><span className="text-gray-500 text-xs font-normal">CPF: {row.users?.cpf}</span></td>
                                    <td className="p-3 text-teal-700 font-medium">{row.medicine_catalog?.active_principle} {row.medicine_catalog?.strength}</td>
                                    <td className="p-3 font-bold text-gray-700">{row.dispensed_quantity} <span className="text-xs font-normal">{row.medicine_catalog?.dispensing_unit}</span></td>
                                    <td className="p-3 text-gray-600">{row.prescribing_doctor}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default function FarmaciaDashboard() {
    const { profile } = useAuth();
    const handleLogout = () => supabase.auth.signOut();

    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Modal State
    const [searchCpf, setSearchCpf] = useState('');
    const [patient, setPatient] = useState<Patient | null>(null);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [activeTab, setActiveTab] = useState<'inicio'|'estoque'|'historico'>('inicio');
    const [ubsName, setUbsName] = useState<string>('');

    const [selectedPrinciple, setSelectedPrinciple] = useState('');
    const [selectedStrength, setSelectedStrength] = useState('');
    const [usageFrequency, setUsageFrequency] = useState('');
    const [selectedMedId, setSelectedMedId] = useState('');
    const [dispensedRaw, setDispensedRaw] = useState('');
    const [doctorName, setDoctorName] = useState('');
    const [prescriptionDate, setPrescriptionDate] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSearchCpf('');
        setPatient(null);
        setSearching(false);
        setError('');
        setSuccessMsg('');
        setSelectedPrinciple('');
        setSelectedStrength('');
        setUsageFrequency('');
        setSelectedMedId('');
        setDispensedRaw('');
        setDoctorName('');
        setPrescriptionDate('');
    };

    useEffect(() => {
        const fetchMedicines = async () => {
            const { data, error } = await supabase.from('medicine_catalog').select('*').order('active_principle');
            if (data) setMedicines(data);
        };
        fetchMedicines();

        if (profile?.cnes) {
            const fetchUbsName = async () => {
                const { data } = await supabase.from('cnes_establishments').select('name').eq('cnes_id', profile.cnes).single();
                if (data) setUbsName(data.name);
            };
            fetchUbsName();
        }
    }, [profile?.cnes]);

    const searchPatient = async () => {
        if (!searchCpf) return;
        setSearching(true);
        setError('');
        setPatient(null);
        
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, cpf, name, diseases')
                .eq('cpf', searchCpf.replace(/\D/g, '')) // Limpa CPF
                .single();

            if (error || !data) {
                setError('Paciente não encontrado. Verifique o CPF.');
            } else {
                setPatient({
                    id: data.id,
                    cpf: data.cpf,
                    name: data.name,
                    conditions: data.diseases || []
                });
            }
        } catch (err) {
            setError('Erro ao buscar paciente.');
        } finally {
            setSearching(false);
        }
    };

    // Filtra o catálogo de todos os medicamentos deixando apenas os que são coerentes com o perfil do paciente
    const filteredMedicines = useMemo(() => {
        if (!patient) return []; // Se não buscou o paciente ainda, nem lista nada
        if (!patient.conditions || patient.conditions.length === 0) return []; // Se não tiver doença registrada, o catálogo fica vazio por segurança

        const conditionsLower = patient.conditions.map(c => c.toLowerCase());

        return medicines.filter(m => {
            const catLower = (m.category || '').toLowerCase();
            
            // Flexibilizando a busca pois no banco o usuário tem "Diabetes tipo 2" e o remédio tem categoria "Diabetes"
            // Então vamos verificar se a doença do paciente INCLUI a categoria do remédio ou vice-versa
            return conditionsLower.some(c => c.includes(catLower) || catLower.includes(c));
        });
    }, [medicines, patient]);

    const uniquePrinciples = useMemo(() => {
        return Array.from(new Set(filteredMedicines.map(m => m.active_principle))).sort();
    }, [filteredMedicines]);

    const availableStrengths = useMemo(() => {
        if (!selectedPrinciple) return [];
        const strengths = filteredMedicines
            .filter(m => m.active_principle === selectedPrinciple)
            .map(m => m.strength);
        return Array.from(new Set(strengths)).sort();
    }, [filteredMedicines, selectedPrinciple]);

    useEffect(() => {
        if (selectedPrinciple && selectedStrength) {
            const med = filteredMedicines.find(m => m.active_principle === selectedPrinciple && m.strength === selectedStrength);
            if (med) setSelectedMedId(med.id);
            else setSelectedMedId('');
        } else {
            setSelectedMedId('');
        }
    }, [selectedPrinciple, selectedStrength, filteredMedicines]);

    const handleFrequencyChange = (freq: string) => {
        setUsageFrequency(freq);
        let dailyQty = 0;
        if (freq === '1x ao dia') dailyQty = 1;
        else if (freq === '12/12h') dailyQty = 2;
        else if (freq === '8/8h') dailyQty = 3;
        else if (freq === '6/6h') dailyQty = 4;
        
        if (dailyQty > 0) {
            setDispensedRaw((dailyQty * 30).toString());
        } else if (!freq) {
            setDispensedRaw('');
        }
    };

    const selectedMed = useMemo(() => {
        return medicines.find(m => m.id === selectedMedId) || null;
    }, [medicines, selectedMedId]);

    const dispensedQuantity = parseInt(dispensedRaw) || 0;
    
    // Caixa equivalente
    const boxEquivalent = useMemo(() => {
        if (!selectedMed || !dispensedQuantity) return null;
        if (selectedMed.reference_box_qty <= 0) return null;
        
        const boxes = Math.floor(dispensedQuantity / selectedMed.reference_box_qty);
        const remainder = dispensedQuantity % selectedMed.reference_box_qty;
        
        let text = `${dispensedQuantity} ${selectedMed.dispensing_unit}(s)`;
        if (boxes > 0) {
            text += ` ➔ Aprox. ${boxes} caixa(s)`;
            if (remainder > 0) text += ` + ${remainder} unidade(s)`;
        }
        return text;
    }, [selectedMed, dispensedQuantity]);

    // Data da próxima retirada (+30 dias) calculada via Local Time
    const nextDispenseDate = useMemo(() => {
        const today = new Date();
        today.setDate(today.getDate() + 30);
        return today.toLocaleDateString('pt-BR');
    }, []);

    // Validação dos 120 dias
    const isPrescriptionValid = useMemo(() => {
        if (!prescriptionDate) return true; // Nenhuma data ainda
        const pDate = new Date(prescriptionDate + 'T00:00:00'); // Evita fuso
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const diffTime = Math.abs(today.getTime() - pDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        return pDate <= today && diffDays <= 120;
    }, [prescriptionDate]);

    const handleDispense = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        
        if (!patient) return setError('Selecione o paciente.');
        if (!selectedMed) return setError('Selecione o medicamento.');
        if (dispensedQuantity <= 0) return setError('Quantidade inválida.');
        if (!isPrescriptionValid) return setError('Receita vencida (mais de 120 dias) ou data inválida.');
        if (!prescriptionDate || !doctorName) return setError('Preencha os dados da receita.');

        setSubmitting(true);
        try {
            const { error: insErr } = await supabase.rpc('dispense_and_deduct_stock', {
                p_patient_id: patient.id,
                p_catalog_id: selectedMed.id,
                p_ubs_cnes: profile?.cnes || '',
                p_quantity: dispensedQuantity,
                p_doctor_name: doctorName,
                p_prescription_date: prescriptionDate
            });

            if (insErr) {
                if (insErr.message.includes('Estoque insuficiente')) {
                   return setError('Estoque insuficiente para esta UBS.');
                }
                throw insErr;
            }

            setSuccessMsg('Dispensação registrada com sucesso!');
            // Reset form
            setTimeout(() => {
                handleCloseModal();
            }, 2000);

        } catch (err: any) {
            setError(err.message || 'Erro ao registrar.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <nav className="bg-white shadow px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Pill className="text-teal-600" size={28} />
                    <h1 className="text-xl font-bold text-gray-800">Painel da Farmácia</h1>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 font-medium hidden sm:inline">Olá, {profile?.nome}</span>
                    <button onClick={handleLogout} className="flex items-center gap-1 text-red-600 hover:text-red-800 cursor-pointer text-sm font-medium">
                        <LogOut size={18} /> Sair
                    </button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div className="mb-8 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Dispensação e Estoque</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {ubsName ? `${ubsName} - ` : ''}{profile?.cnes || 'N/D'}
                        </p>
                    </div>
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg shadow flex items-center gap-2 font-medium transition"
                    >
                        <Plus size={20} /> Nova Dispensação
                    </button>
                </div>

                <div className="flex border-b border-gray-200 mb-6 space-x-6 overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('inicio')}
                        className={`pb-3 font-medium text-sm border-b-2 transition whitespace-nowrap ${activeTab === 'inicio' ? 'border-teal-600 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        <div className="flex items-center gap-2"><ClipboardList size={18} /> Catálogo Público</div>
                    </button>
                    <button 
                        onClick={() => setActiveTab('estoque')}
                        className={`pb-3 font-medium text-sm border-b-2 transition whitespace-nowrap ${activeTab === 'estoque' ? 'border-teal-600 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        <div className="flex items-center gap-2"><PackageSearch size={18} /> Controle de Estoque</div>
                    </button>
                    <button 
                        onClick={() => setActiveTab('historico')}
                        className={`pb-3 font-medium text-sm border-b-2 transition whitespace-nowrap ${activeTab === 'historico' ? 'border-teal-600 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        <div className="flex items-center gap-2"><History size={18} /> Histórico de Retiradas</div>
                    </button>
                </div>

                {activeTab === 'inicio' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-teal-50 text-teal-600 rounded-lg">
                                    <ClipboardList size={24} />
                                </div>
                                <h3 className="text-lg font-semibold">Catálogo SUS (Hiperdia)</h3>
                            </div>
                            <p className="text-gray-600 text-sm mb-4">
                                Consulte os medicamentos disponíveis e suas unidades mínimas (ex: cápsulas, frascos, refis).
                            </p>
                            <div className="h-64 overflow-y-auto pr-2">
                                {medicines.length === 0 ? (
                                    <p className="text-sm text-gray-400 italic">Carregando catálogo...</p>
                                ) : (
                                    <ul className="divide-y divide-gray-100">
                                        {medicines.map(m => (
                                            <li key={m.id} className="py-3 flex justify-between items-center">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{m.active_principle} {m.strength}</p>
                                                    <p className="text-xs text-gray-500">{m.form} • {m.category}</p>
                                                </div>
                                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                                    {m.dispensing_unit}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'estoque' && (
                    <FarmaciaEstoque cnes={profile?.cnes || ''} catalog={medicines} />
                )}
                {activeTab === 'historico' && (
                    <FarmaciaHistorico cnes={profile?.cnes || ''} />
                )}

                {/* MODAL DE DISPENSAÇÃO */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <Pill className="text-teal-600" size={20} />
                                    Registrar Dispensação
                                </h3>
                                <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                                    <X size={24} />
                                </button>
                            </div>
                            
                            <div className="p-6 overflow-y-auto flex-1">
                                {successMsg ? (
                                    <div className="flex flex-col items-center justify-center py-10">
                                        <CheckCircle className="text-green-500 h-16 w-16 mb-4" />
                                        <h4 className="text-xl font-bold text-gray-800">{successMsg}</h4>
                                        <p className="text-gray-500 mt-2">A janela será fechada em instantes.</p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleDispense} className="space-y-6">
                                        {/* Buscador de Paciente */}
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                            <label className="block text-sm font-medium text-gray-700 mb-1 ">Buscar Paciente (CPF)</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    inputMode='numeric'
                                                    pattern='[0-9]*'
                                                    maxLength={11}
                                                    placeholder="Apenas números..."
                                                    className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2 border"
                                                    value={searchCpf}
                                                    onChange={e => {
                                                        const numericVal = e.target.value.replace(/\D/g, '').slice(0, 11);
                                                        setSearchCpf(numericVal);
                                                    }}
                                                />
                                                <button
                                                    type="button" 
                                                    onClick={searchPatient}
                                                    disabled={searching || !searchCpf}
                                                    className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    <Search size={18} /> {searching ? 'Buscando...' : 'Buscar'}
                                                </button>
                                            </div>
                                            {patient && (
                                                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex flex-col sm:flex-row sm:items-center gap-2 text-green-800">
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle size={18} />
                                                        <span className="font-medium">{patient.name}</span>
                                                        <span className="text-sm opacity-80">(CPF: {patient.cpf || searchCpf})</span>
                                                    </div>
                                                    
                                                    {/* Mostrar bagdes das condições do paciente */}
                                                    {patient.conditions && patient.conditions.length > 0 && (
                                                        <div className="flex gap-1 flex-wrap mt-1 sm:mt-0 sm:ml-auto">
                                                            {patient.conditions.map(cond => (
                                                                <span key={cond} className="px-2 py-0.5 bg-green-200 text-green-800 text-xs font-bold rounded-full">
                                                                    {cond}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Princípio Ativo */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Medicamento *</label>
                                                <CustomSelect
                                                    options={uniquePrinciples.map(p => ({ value: p, label: p }))}
                                                    value={selectedPrinciple}
                                                    onChange={(val) => {
                                                        setSelectedPrinciple(val as string);
                                                        setSelectedStrength('');
                                                    }}
                                                    placeholder="Selecione"
                                                />
                                            </div>

                                            {/* Dosagem / Apresentação */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1 ">Dosagem *</label>
                                                <CustomSelect
                                                    disabled={!selectedPrinciple}
                                                    options={availableStrengths.map(s => {
                                                        const m = filteredMedicines.find(med => med.active_principle === selectedPrinciple && med.strength === s);
                                                        return { value: s, label: `${s} (${m?.form})` };
                                                    })}
                                                    value={selectedStrength}
                                                    onChange={(val) => setSelectedStrength(val as string)}
                                                    placeholder="Selecione"
                                                    
                                                />
                                            </div>

                                            {/* Forma de Uso */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Uso prescrito *</label>
                                                <CustomSelect
                                                    disabled={!selectedStrength}
                                                    options={[
                                                        { value: "1x ao dia", label: "1x ao dia" },
                                                        { value: "12/12h", label: "12/12h (2x ao dia)" },
                                                        { value: "8/8h", label: "8/8h (3x ao dia)" },
                                                        { value: "6/6h", label: "6/6h (4x ao dia)" },
                                                        { value: "Outro", label: "Outro (Inserir qtd manualmente)" }
                                                    ]}
                                                    value={usageFrequency}
                                                    onChange={(val) => handleFrequencyChange(val as string)}
                                                    placeholder="Selecione a frequência"
                                                />
                                            </div>

                                            {/* Quantidade */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Qtd Mensal ({selectedMed ? selectedMed.dispensing_unit + 's' : 'Unidades'}) *
                                                </label>
                                                <input
                                                    type="number"
                                                    required
                                                    min="1"
                                                    disabled={!selectedMed || usageFrequency !== 'Outro'}
                                                    className="w-full min-h-[46px] rounded-lg border border-gray-300 shadow-sm focus:ring-1 focus:border-teal-500 focus:ring-teal-500 p-2.5 px-3 bg-white text-base text-gray-900 font-normal outline-none disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    value={dispensedRaw}
                                                    onKeyDown={(e) => {
                                                        if (e.key === '-' || e.key === 'e' || e.key === '.' || e.key === ',') {
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        // Apenas permite números inteiros maiores que 0
                                                        if (val === '' || Number(val) >= 0) {
                                                            setDispensedRaw(val);
                                                        }
                                                    }}
                                                />
                                                {boxEquivalent && (
                                                    <p className="mt-1 text-xs text-teal-700 font-medium flex items-center gap-1">
                                                        <AlertCircle size={12} /> {boxEquivalent}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Próxima Retirada Display */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Próxima Retirada Permitida</label>
                                                <div className="w-full min-h-[46px] bg-gray-100 p-2.5 px-3 rounded-lg border border-gray-200 text-gray-600 flex items-center gap-2">
                                                    <Calendar size={20} strokeWidth={1.5} className="text-gray-600" />
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-normal text-gray-900 text-base">{nextDispenseDate || 'dd/mm/aaaa'}</span>
                                                        <span className="text-xs text-gray-500">(+30 dias)</span>
                                                    </div>
                                                    
                                                </div>
                                            </div>

                                            {/* Dados da Receita */}
                                            <div className="col-span-1 md:col-span-2 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Médico (Receita) *</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        className="w-full min-h-[46px] rounded-lg border border-gray-300 shadow-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500 p-2.5 px-3 bg-white text-base text-gray-900 font-normal outline-none"
                                                        value={doctorName}
                                                        onChange={e => setDoctorName(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Data da Receita *</label>
                                                    <div className="relative">
                                                        <Calendar size={20} strokeWidth={1.5} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${!isPrescriptionValid ? 'text-red-500' : 'text-gray-500'}`} />
                                                        <input
                                                            type="date"
                                                            required
                                                            max={new Date().toISOString().split('T')[0]}
                                                            className={`w-full min-h-[46px] rounded-lg border shadow-sm p-2.5 pl-10 pr-3 text-base font-normal outline-none [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer ${!isPrescriptionValid ? 'border-red-300 focus:ring-1 focus:border-red-500 focus:ring-red-500 bg-red-50 text-red-900' : 'border-gray-300 focus:ring-1 focus:border-teal-500 focus:ring-teal-500 bg-white text-gray-900'}`}
                                                            value={prescriptionDate}
                                                            onChange={e => setPrescriptionDate(e.target.value)}
                                                        />
                                                    </div>
                                                    {!isPrescriptionValid && (
                                                        <p className="mt-1 text-xs text-red-600">Receita passou da validade legal de 120 dias do SUS.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {error && (
                                            <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm font-medium">
                                                <AlertCircle size={18} /> {error}
                                            </div>
                                        )}

                                        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                                            <button 
                                                type="button" 
                                                onClick={handleCloseModal}
                                                className="px-5 py-2.5 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition"
                                            >
                                                Cancelar
                                            </button>
                                            <button 
                                                type="submit"
                                                disabled={
                                                    submitting || 
                                                    !patient || 
                                                    !selectedMed || 
                                                    !usageFrequency || 
                                                    !dispensedRaw || 
                                                    !doctorName || 
                                                    !prescriptionDate || 
                                                    !isPrescriptionValid || 
                                                    Number(dispensedRaw) <= 0
                                                }
                                                className="px-5 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                {submitting ? 'Salvando...' : 'Confirmar Dispensação'}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
