import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { LogOut, Pill, ClipboardList, Search, Plus, Calendar, AlertCircle, X, CheckCircle, PackageSearch, History, Users, RotateCcw, Edit, Trash2, Home, TrendingDown, Clock, Loader2, UserCheck } from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useNotification } from '../../contexts/NotificationContext';

import { formatCpf } from '../../lib/utils';
import { CnesService } from '../../lib/cnesService';

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

function FarmaciaEstoque({ cnes, catalog, initialFilter = 'all' }: { cnes: string; catalog: Medicine[]; initialFilter?: string }) {
    const [inventory, setInventory] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const { showNotification } = useNotification();
    const [updating, setUpdating] = useState<string | null>(null);
    const [adjustments, setAdjustments] = useState<Record<string, string>>({});

    // Filters
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [stockFilter, setStockFilter] = useState(initialFilter);

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

    const handleUpdateStock = async (med: Medicine, changeRaw: string, inputElement?: HTMLInputElement) => {
        if (!changeRaw || changeRaw.trim() === '') {
            if (inputElement) inputElement.focus();
            return;
        }
        if (isNaN(Number(changeRaw))) return;
        let quantity = Number(changeRaw);

        // Auto-clamp values between -9999 and 9999
        if (quantity < -9999) quantity = -9999;
        if (quantity > 9999) quantity = 9999;

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
                setAdjustments(prev => ({ ...prev, [med.id]: '' }));
                showNotification('success', 'Estoque atualizado com sucesso!');
            } else {
                showNotification('error', 'Erro ao atualizar estoque: ' + error.message);
            }
        } catch (err: any) {
            console.error(err);
            showNotification('error', 'Falha na comunicação com o servidor.');
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
        if (stockFilter === 'low_stock') matchStock = stock < 50;

        return matchSearch && matchCat && matchStock;
    });

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
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
                        <option value="low_stock">Estoque Baixo ({"<"} 50)</option>
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

            {loading ? <p className="text-gray-500 italic shrink-0">Carregando catálogo e estoque...</p> : (
                <div className="flex-1 overflow-auto min-h-0 border border-gray-100 rounded-lg shadow-inner">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-gray-50 shadow-sm z-10">
                            <tr className="border-b border-gray-200 text-sm text-gray-600">
                                <th className="p-3 font-medium rounded-tl-lg">Medicamento</th>
                                <th className="p-3 font-medium w-[20%]">Categoria / Forma</th>
                                <th className="p-3 font-medium text-center">Saldo</th>
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
                                                {stock} <span className="text-xs font-normal text-gray-500 ml-1">{med.dispensing_unit}{stock > 1 ? 's' : ''}</span>
                                            </td>
                                            <td className="p-3">
                                                <form onSubmit={(e) => { e.preventDefault(); handleUpdateStock(med, adjustments[med.id] || '', e.currentTarget.elements.namedItem('change') as HTMLInputElement); }} className="flex items-center gap-2">
                                                    <input
                                                        name="change"
                                                        type="number"
                                                        min="-9999"
                                                        max="9999"
                                                        value={adjustments[med.id] || ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === '') {
                                                                setAdjustments(prev => ({ ...prev, [med.id]: '' }));
                                                                return;
                                                            }
                                                            if (val === '-') {
                                                                setAdjustments(prev => ({ ...prev, [med.id]: '-' }));
                                                                return;
                                                            }
                                                            const num = Number(val);
                                                            if (num >= -9999 && num <= 9999 && val.length <= 5) {
                                                                setAdjustments(prev => ({ ...prev, [med.id]: val }));
                                                            }
                                                        }}
                                                        placeholder="Ex: 100 ou -10"
                                                        disabled={updating === med.id}
                                                        className="w-32 border border-gray-200 bg-white p-1.5 px-3 rounded-lg text-sm text-center outline-none focus:border-teal-500 transition-all"
                                                    />
                                                    <button type="submit" disabled={updating === med.id} className="bg-teal-100 hover:bg-teal-200 text-teal-700 px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 min-w-[70px] flex items-center justify-center">
                                                        {updating === med.id ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
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
    const [undoing, setUndoing] = useState<number | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, data?: any }>({ isOpen: false });
    const { showNotification } = useNotification();

    const fetchHistory = async () => {
        if (!cnes) return;
        setLoading(true);
        const { data } = await supabase
            .from('medicine_dispensations')
            .select('id, catalog_id, dispensed_at, dispensed_quantity, prescribing_doctor, ubs_cnes, patients!medicine_dispensations_patient_id_fkey(name, cpf), medicine_catalog(active_principle, strength, dispensing_unit)')
            .eq('ubs_cnes', cnes)
            .order('dispensed_at', { ascending: false })
            .limit(50);

        if (data) setHistory(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchHistory();
    }, [cnes]);

    const handleUndo = async () => {
        if (!confirmModal.data) return;
        const { dispensationId, catalogId, quantity } = confirmModal.data;

        setUndoing(dispensationId);
        try {
            // 0. Remove do app mobile do paciente
            await supabase
                .from('medications')
                .delete()
                .eq('dispensation_id', dispensationId);

            // 1. Deletar o registro de dispensação
            const { error: delErr } = await supabase
                .from('medicine_dispensations')
                .delete()
                .eq('id', dispensationId);

            if (delErr) throw delErr;

            // 2. Buscar o estoque atual
            const { data: stockData } = await supabase
                .from('pharmacy_inventory')
                .select('quantity_in_stock')
                .eq('ubs_cnes', cnes)
                .eq('catalog_id', catalogId)
                .single();

            // 3. Atualizar devolvendo o estoque
            if (stockData) {
                await supabase
                    .from('pharmacy_inventory')
                    .update({
                        quantity_in_stock: stockData.quantity_in_stock + quantity,
                        last_updated_at: new Date().toISOString()
                    })
                    .eq('ubs_cnes', cnes)
                    .eq('catalog_id', catalogId);
            }

            // Atualiza a lista após desfazer
            fetchHistory();
            setConfirmModal({ isOpen: false });
            showNotification('success', 'Retirada desfeita e saldo devolvido com sucesso!');
        } catch (err: any) {
            console.error(err);
            setConfirmModal({ isOpen: false });
            showNotification('error', 'Falha ao desfazer: ' + err.message);
        } finally {
            setUndoing(null);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0">
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title="Desfazer Dispensação"
                message={`Tem certeza que deseja desfazer esta dispensação? Isso devolverá ${confirmModal.data?.quantity} unidades para o estoque da UBS.`}
                confirmText="Sim, desfazer"
                cancelText="Mudei de ideia"
                onConfirm={handleUndo}
                onCancel={() => setConfirmModal({ isOpen: false })}
                loading={undoing !== null}
            />



            <div className="flex items-center gap-3 mb-6 shrink-0">
                <div className="p-3 bg-teal-50 text-teal-600 rounded-lg"><History size={24} /></div>
                <h3 className="text-lg font-semibold">Últimas Retiradas</h3>
            </div>

            {loading ? <p className="text-gray-500 italic shrink-0">Buscando histórico...</p> : history.length === 0 ? <p className="text-gray-500 italic shrink-0">Nenhuma retirada registrada ainda.</p> : (
                <div className="flex-1 overflow-auto min-h-0 border border-gray-100 rounded-lg shadow-inner">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-gray-50 shadow-sm z-10">
                            <tr className="border-b border-gray-200 text-sm text-gray-600">
                                <th className="p-3 font-medium">Data/Hora</th>
                                <th className="p-3 font-medium">Paciente</th>
                                <th className="p-3 font-medium">Medicamento Retirado</th>
                                <th className="p-3 font-medium">Qtd.</th>
                                <th className="p-3 font-medium">Prescritor</th>
                                <th className="p-3 font-medium text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {history.map(row => (
                                <tr key={row.id} className="hover:bg-gray-50 text-sm">
                                    <td className="p-3 text-gray-600 whitespace-nowrap">{new Date(row.dispensed_at).toLocaleString('pt-BR')}</td>
                                    <td className="p-3 font-medium text-gray-800">{row.patients?.name}<br /><span className="text-gray-500 text-xs font-normal">CPF: {formatCpf(row.patients?.cpf)}</span></td>
                                    <td className="p-3 text-teal-700 font-medium">
                                        {row.medicine_catalog?.active_principle} {row.medicine_catalog?.strength}
                                        {row.med?.stock !== undefined && (
                                            <div className="text-xs text-gray-500 mt-1">Estoque App: {row.med.stock} {row.medicine_catalog?.dispensing_unit || 'un.'}</div>
                                        )}
                                    </td>
                                    <td className="p-3 font-bold text-gray-700">{row.dispensed_quantity} <span className="text-xs font-normal">{row.medicine_catalog?.dispensing_unit}{row.dispensed_quantity > 1 ? 's' : ''}</span></td>
                                    <td className="p-3 text-gray-600">{row.prescribing_doctor}</td>
                                    <td className="p-3 text-center">
                                        <button
                                            onClick={() => setConfirmModal({ isOpen: true, data: { dispensationId: row.id, catalogId: row.catalog_id, quantity: row.dispensed_quantity } })}
                                            disabled={undoing === row.id}
                                            title="Desfazer e Devolver Estoque"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition disabled:opacity-50 inline-flex items-center justify-center"
                                        >
                                            {undoing === row.id ? '⏳' : <RotateCcw size={18} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function FarmaciaMonitoramento({ cnes }: { cnes: string }) {
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!cnes) return;

        const fetchMonitoramento = async () => {
            const fortyFiveDaysAgo = new Date();
            fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

            const { data: dispData } = await supabase
                .from('medicine_dispensations')
                .select('id, dispensed_at, dispensed_quantity, frequency_label, patients!medicine_dispensations_patient_id_fkey(id, name, cpf), medicine_catalog(active_principle, strength, dispensing_unit)')
                .eq('ubs_cnes', cnes)
                .gte('dispensed_at', fortyFiveDaysAgo.toISOString())
                .order('dispensed_at', { ascending: false });

            let medsData: any[] = [];
            if (dispData && dispData.length > 0) {
                const dispIds = dispData.map((d: any) => d.id).filter(Boolean);
                const { data: meds } = await supabase
                    .from('medications')
                    .select('id, owner_id, stock, frequency, dispensation_id')
                    .in('dispensation_id', dispIds);
                medsData = meds || [];
            }

            if (dispData) {
                const grouped = new Map();
                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);

                dispData.forEach((item: any) => {
                    const key = `${item.patients?.id}-${item.medicine_catalog?.active_principle}`;
                    if (!grouped.has(key)) {
                        const med = medsData.find(m => m.dispensation_id === item.id);

                        let dataPrevista: Date;
                        let diffDays: number;
                        let source = 'dispensation';

                        if (med && med.stock !== undefined && med.stock !== null) {
                            // Calcular previsão a partir do estoque do app
                            let dailyDose = 1;
                            if (Array.isArray(med.frequency) && med.frequency.length > 0) {
                                dailyDose = med.frequency.length;
                            } else if (item.frequency_label) {
                                const label = String(item.frequency_label).toLowerCase();
                                if (label.includes('12')) dailyDose = 2;
                                else if (label.includes('8')) dailyDose = 3;
                                else if (label.includes('6')) dailyDose = 4;
                                else dailyDose = 1;
                            }
                            if (dailyDose <= 0) dailyDose = 1;

                            const stockNum = Number(med.stock) || 0;
                            const daysLeft = Math.ceil(stockNum / dailyDose);
                            dataPrevista = new Date(hoje.getTime() + daysLeft * 24 * 60 * 60 * 1000);
                            diffDays = daysLeft;
                            source = 'medications';
                        } else {
                            // Fallback: usar dispensed_at + 30 dias
                            const dispensedDate = new Date(item.dispensed_at);
                            dataPrevista = new Date(dispensedDate);
                            dataPrevista.setDate(dataPrevista.getDate() + 30);
                            const diffTime = dataPrevista.getTime() - hoje.getTime();
                            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        }

                        // Critério para exibir: dentro do limiar (7 dias) OU estoque baixo no app
                        const includeThreshold = 7;
                        const lowStockThreshold = 5;
                        const isLowStock = med && (Number(med.stock) <= lowStockThreshold);
                        if (diffDays <= includeThreshold || isLowStock) {
                            grouped.set(key, { ...item, dataPrevista, diffDays, source, med });
                        }
                    }
                });

                setPatients(Array.from(grouped.values()).sort((a, b) => a.diffDays - b.diffDays));
            }
            setLoading(false);
        };
        fetchMonitoramento();
    }, [cnes]);

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-3 mb-6 shrink-0">
                <div className="p-3 bg-red-50 text-red-600 rounded-lg"><Users size={24} /></div>
                <div>
                    <h3 className="text-lg font-semibold">Alerta de Estoque em Pacientes</h3>
                    <p className="text-sm text-gray-500">Pacientes que retiraram comissão há +23 dias (base 30 dias)</p>
                </div>
            </div>

            {loading ? <p className="text-gray-500 italic shrink-0">Analisando dados...</p> : patients.length === 0 ? <p className="text-gray-500 italic shrink-0">Nenhum paciente com medicação perto de acabar.</p> : (
                <div className="flex-1 overflow-auto min-h-0 border border-gray-100 rounded-lg shadow-inner">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-gray-50 shadow-sm z-10">
                            <tr className="border-b border-gray-200 text-sm text-gray-600">
                                <th className="p-3 font-medium">Situação</th>
                                <th className="p-3 font-medium">Paciente</th>
                                <th className="p-3 font-medium">Medicamento</th>
                                <th className="p-3 font-medium">Previsto Acabar em</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {patients.map(row => (
                                <tr key={row.id} className="hover:bg-gray-50 text-sm">
                                    <td className="p-3">
                                        {row.diffDays < 0 ? (
                                            <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Atrasado (há {-row.diffDays} dias)</span>
                                        ) : row.diffDays === 0 ? (
                                            <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold">Acaba Hoje</span>
                                        ) : (
                                            <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold">Acaba em {row.diffDays} dia(s)</span>
                                        )}
                                    </td>
                                    <td className="p-3 font-medium text-gray-800">{row.patients?.name}<br /><span className="text-gray-500 text-xs font-normal">CPF: {formatCpf(row.patients?.cpf)}</span></td>
                                    <td className="p-3 text-teal-700 font-medium">{row.medicine_catalog?.active_principle} {row.medicine_catalog?.strength}</td>
                                    <td className="p-3 text-gray-600">{row.dataPrevista.toLocaleDateString('pt-BR')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function FarmaciaPacientes({ cnes }: { cnes: string }) {
    const [searchCpf, setSearchCpf] = useState('');
    const [patient, setPatient] = useState<any>(null);
    const [patientMeds, setPatientMeds] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [loadingMeds, setLoadingMeds] = useState(false);
    const [editQuantity, setEditQuantity] = useState<number | ''>('');
    const [saving, setSaving] = useState(false);
    const [editStartTime, setEditStartTime] = useState('');
    const [editFrequencyLabel, setEditFrequencyLabel] = useState('');
    const [editingMed, setEditingMed] = useState<any | null>(null);
    const { showNotification } = useNotification();

    const generateTimes = (start: string, label: string) => {
        if (!start || !label) return start ? [start] : [];
        const [h, m] = start.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return [start];

        const date = new Date();
        date.setHours(h, m, 0, 0);

        const times = [start];
        let freq = 0;
        let count = 1;

        const cleanLabel = label.toLowerCase();

        if (cleanLabel.includes('12/12h') || cleanLabel.includes('2x ao dia') || cleanLabel.includes('2x dia')) {
            freq = 12;
            count = 2;
        } else if (cleanLabel.includes('8/8h') || cleanLabel.includes('3x ao dia') || cleanLabel.includes('3x dia')) {
            freq = 8;
            count = 3;
        } else if (cleanLabel.includes('6/6h') || cleanLabel.includes('4x ao dia') || cleanLabel.includes('4x dia')) {
            freq = 6;
            count = 4;
        } else if (cleanLabel.includes('4/4h') || cleanLabel.includes('6x ao dia') || cleanLabel.includes('6x dia')) {
            freq = 4;
            count = 6;
        }

        if (freq > 0) {
            for (let i = 1; i < count; i++) {
                const nextDate = new Date(date.getTime() + freq * i * 3600000);
                times.push(nextDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }));
            }
        }
        return times;
    };

    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, id?: string }>({ isOpen: false });

    const fetchPatientMeds = async (patientId: string) => {
        setLoadingMeds(true);
        const { data } = await supabase
            .from('medications')
            .select(`
                id, stock, frequency, dispensation_id,
                medicine_dispensations!inner (
                    id, catalog_id, dispensed_at, dispensed_quantity, frequency_label, scheduled_times,
                    medicine_catalog (active_principle, strength, form, dispensing_unit)
                )
            `)
            .eq('medicine_dispensations.patient_id', patientId)
            .eq('medicine_dispensations.ubs_cnes', cnes)
            .order('created_at', { ascending: false });

        if (data) {
            setPatientMeds(data);
        }
        setLoadingMeds(false);
    };

    const searchPatient = async () => {
        const cleanCpf = searchCpf.replace(/\D/g, '');
        if (cleanCpf.length < 11) {
            showNotification('warning', 'Digite o CPF completo (11 dígitos) para buscar.');
            return;
        }
        if (!cnes) return;
        setSearching(true);
        setPatient(null);
        setPatientMeds([]);

        try {
            const { data, error } = await supabase
                .from('patients')
                .select('id, cpf, name, diseases')
                .eq('cpf', searchCpf.replace(/\D/g, ''))
                .single();

            if (error || !data) {
                showNotification('error', 'Paciente não encontrado com o CPF informado.');
            } else {
                setPatient(data);
                fetchPatientMeds(data.id);
            }
        } catch (err) {
            showNotification('error', 'Erro ao buscar dados do paciente.');
        } finally {
            setSearching(false);
        }
    };

    const handleSaveEdit = async (id: string) => {
        setSaving(true);
        try {
            const times = generateTimes(editStartTime, editFrequencyLabel);

            const medInfo = patientMeds.find(m => m.id === id);
            if (!medInfo) throw new Error('Medicamento não encontrado.');

            const { error: medError } = await supabase
                .from('medications')
                .update({ stock: editQuantity || 0, frequency: times, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (medError) throw medError;

            // Atualiza também o label e os horários no histórico de dispensação
            const dispId = medInfo.dispensation_id || medInfo.medicine_dispensations?.id;
            if (dispId) {
                const { error: dispError } = await supabase
                    .from('medicine_dispensations')
                    .update({ frequency_label: editFrequencyLabel, scheduled_times: times })
                    .eq('id', dispId);
                if (dispError) throw dispError;
            }

            showNotification('success', 'Estoque e histórico atualizados!');
            setEditingMed(null);
            fetchPatientMeds(patient.id);
        } catch (err: any) {
            showNotification('error', 'Falha ao editar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        const id = confirmModal.id;
        if (!id) return;

        setSaving(true);
        try {
            const medInfo = patientMeds.find(m => m.id === id);
            if (!medInfo) throw new Error('Medicamento não encontrado.');

            // Apenas remover a linha do app (tabela `medications`).
            const { error } = await supabase.from('medications').delete().eq('id', id);
            if (error) throw error;

            setConfirmModal({ isOpen: false });
            showNotification('success', 'Medicamento removido do app do paciente.');
            fetchPatientMeds(patient.id);
        } catch (err: any) {
            setConfirmModal({ isOpen: false });
            showNotification('error', 'Falha ao remover: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0">
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title="Remover medicamento do App?"
                message="Esta ação removerá o medicamento apenas do aplicativo do paciente. Não alterará o histórico de dispensação nem o estoque da UBS."
                confirmText="Sim, remover"
                cancelText="Cancelar"
                onConfirm={handleDelete}
                onCancel={() => setConfirmModal({ isOpen: false })}
                loading={saving}
            />



            <div className="shrink-0 flex items-center gap-3 mb-6">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Users size={24} /></div>
                <div>
                    <h3 className="text-lg font-semibold">Consultar Paciente</h3>
                    <p className="text-sm text-gray-500">Busque um paciente para editar as dosagens do aplicativo móvel dele</p>
                </div>
            </div>

            <div className="shrink-0 bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 w-full max-w-lg">
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar Paciente (Nome ou CPF)</label>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!searching) searchPatient();
                    }}
                    className="flex gap-2"
                >
                    <input
                        type="text"
                        placeholder="Nome ou CPF..."
                        className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2 border font-medium"
                        value={searchCpf}
                        onChange={e => {
                            const val = e.target.value;
                            if (!val) {
                                setSearchCpf('');
                                return;
                            }
                            const firstChar = val[0];
                            if (/[0-9]/.test(firstChar)) {
                                // Modo CPF
                                const onlyDigits = val.replace(/\D/g, '');
                                setSearchCpf(formatCpf(onlyDigits).slice(0, 14));
                            } else {
                                // Modo Nome
                                const onlyLetters = val.replace(/[0-9]/g, '');
                                setSearchCpf(onlyLetters.slice(0, 30));
                            }
                        }}
                    />
                    <button
                        type="submit"
                        disabled={searching || !searchCpf}
                        className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 min-w-[100px]"
                    >
                        {searching ? <Loader2 size={18} className="animate-spin" /> : (
                            <>
                                <Search size={18} /> Buscar
                            </>
                        )}
                    </button>
                </form>
            </div>

            {patient && (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="shrink-0 p-4 bg-teal-50 border border-teal-100 rounded-xl mb-4">
                        <h4 className="font-bold text-teal-900 text-lg">{patient.name}</h4>
                        <p className="text-teal-700 text-sm">CPF: {formatCpf(patient.cpf)}</p>
                        {patient.diseases && patient.diseases.length > 0 && (
                            <div className="flex gap-2 flex-wrap mt-2">
                                {patient.diseases.map((cond: string) => (
                                    <span key={cond} className="px-2 py-1 bg-teal-200 text-teal-800 text-xs font-bold rounded-full">
                                        {cond}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <h5 className="shrink-0 font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <Pill size={18} /> Lista Ativa do Aplicativo
                    </h5>

                    {loadingMeds ? (
                        <p className="text-gray-500 text-sm italic shrink-0">Carregando plano terapêutico...</p>
                    ) : patientMeds.length === 0 ? (
                        <p className="text-gray-500 text-sm italic shrink-0">Nenhum medicamento ativo encontrado para este paciente nesta UBS.</p>
                    ) : (
                        <div className="flex-1 overflow-y-auto min-h-0 pr-2 grid gap-3 content-start">
                            {patientMeds.map(med => {
                                const isEditing = editingMed === med.id;
                                const oDisp = med.medicine_dispensations;
                                const oCat = oDisp.medicine_catalog;

                                return (
                                    <div key={med.id} className="p-4 border border-gray-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <p className="font-bold text-gray-900">{oCat.active_principle} <span className="font-normal text-gray-500 text-sm">({oCat.strength} • {oCat.form})</span></p>

                                            {isEditing ? (
                                                <div className="mt-3 flex flex-col gap-3">
                                                    <div className="flex flex-col sm:flex-row gap-3">
                                                        <div>
                                                            <span className="block text-xs font-medium text-gray-500 mb-1">Estoque Paciente</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                className="w-full sm:w-28 px-2 py-1.5 text-sm border border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none rounded bg-white"
                                                                value={editQuantity}
                                                                onChange={e => setEditQuantity(e.target.value === '' ? '' : parseInt(e.target.value))}
                                                            />
                                                        </div>
                                                        <div>
                                                            <span className="block text-xs font-medium text-gray-500 mb-1">Frequência Diária</span>
                                                            <select
                                                                className="w-full sm:w-36 px-2 py-1.5 text-sm border border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none rounded bg-white"
                                                                value={editFrequencyLabel}
                                                                onChange={e => setEditFrequencyLabel(e.target.value)}
                                                            >
                                                                <option value="1x ao dia">1x ao dia</option>
                                                                <option value="12/12h">12/12h</option>
                                                                <option value="8/8h">8/8h</option>
                                                                <option value="6/6h">6/6h</option>
                                                                <option value="4/4h">4/4h</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <span className="block text-xs font-medium text-gray-500 mb-1">1º Horário no App</span>
                                                            <input
                                                                type="time"
                                                                className="w-full sm:w-28 px-2 py-1.5 text-sm border border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none rounded bg-white"
                                                                value={editStartTime}
                                                                onChange={e => setEditStartTime(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>

                                                    {editStartTime && editFrequencyLabel && (
                                                        <div className="bg-teal-50 border border-teal-100 p-2 rounded text-xs text-teal-800">
                                                            <span className="font-semibold">Alarmes no App:</span> {generateTimes(editStartTime, editFrequencyLabel).join(' • ')}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-2 mt-1">
                                                        <button
                                                            onClick={() => handleSaveEdit(med.id)}
                                                            disabled={saving || !editStartTime || editQuantity === ''}
                                                            className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                                                        >Salvar no App</button>
                                                        <button
                                                            onClick={() => setEditingMed(null)}
                                                            className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
                                                        >Cancelar</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="mt-1 flex flex-col gap-1">
                                                    <p className="text-teal-700 font-medium text-sm">
                                                        {med.frequency?.length ? `${med.frequency.length}x ao dia` : 'Não especificado'}

                                                        {med.frequency && Array.isArray(med.frequency) && med.frequency.length > 0 && (
                                                            <span className="ml-2 px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded text-xs border border-teal-200">
                                                                {med.frequency.join(' • ')}
                                                            </span>
                                                        )}
                                                    </p>
                                                    <div className="text-gray-500 text-xs mt-1">
                                                        <span>Restam {med.stock} un. em estoque.</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {!isEditing && (
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    onClick={() => {
                                                        setEditingMed(med.id);
                                                        setEditQuantity(med.stock || 0);

                                                        // Tenta inferir a frequência se o label estiver vazio
                                                        const freqCount = med.frequency?.length || 0;
                                                        const inferredLabel = freqCount === 2 ? '12/12h' :
                                                            freqCount === 3 ? '8/8h' :
                                                                freqCount === 4 ? '6/6h' :
                                                                    freqCount === 6 ? '4/4h' : '1x ao dia';

                                                        setEditFrequencyLabel(oDisp.frequency_label || inferredLabel);
                                                        setEditStartTime(med.frequency?.[0] || '08:00');
                                                    }}
                                                    className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition"
                                                    title="Editar"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                                <button
                                                    onClick={() => setConfirmModal({ isOpen: true, id: med.id })}
                                                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                    title="Remover do App do Paciente"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function FarmaciaResumoDashboard({ cnes, catalogSize, onNavigateToEstoqueBaixo }: { cnes: string, catalogSize: number, onNavigateToEstoqueBaixo?: () => void }) {
    const [stats, setStats] = useState({
        lowStockItems: 0,
        dispensationsToday: 0,
        totalPatientsTreated: 0
    });
    const [recentActivies, setRecentActivities] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!cnes) return;
            setLoading(true);

            // 1. Itens com estoque baixo (< 50)
            const { count: lowStockCount } = await supabase
                .from('pharmacy_inventory')
                .select('*', { count: 'exact', head: true })
                .eq('ubs_cnes', cnes)
                .lt('quantity_in_stock', 50);

            // 2. Dispensações Hoje
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const { count: dispTodayCount } = await supabase
                .from('medicine_dispensations')
                .select('*', { count: 'exact', head: true })
                .eq('ubs_cnes', cnes)
                .gte('dispensed_at', today.toISOString());

            // 3. Resumo total de pacientes atendidos (sem duplicatas)
            const { data: patData } = await supabase
                .from('medicine_dispensations')
                .select('patient_id')
                .eq('ubs_cnes', cnes);
            const uniquePatients = new Set(patData?.map(d => d.patient_id)).size;

            // 4. Atividades recentes (últimas 4 retiradas)
            const { data: recentMsg } = await supabase
                .from('medicine_dispensations')
                .select('id, dispensed_at, dispensed_quantity, patients!medicine_dispensations_patient_id_fkey(name), medicine_catalog(active_principle, strength)')
                .eq('ubs_cnes', cnes)
                .order('dispensed_at', { ascending: false })
                .limit(4);

            setStats({
                lowStockItems: lowStockCount || 0,
                dispensationsToday: dispTodayCount || 0,
                totalPatientsTreated: uniquePatients || 0
            });
            setRecentActivities(recentMsg || []);
            setLoading(false);
        };

        fetchDashboardData();
    }, [cnes]);

    if (loading) {
        return <p className="text-gray-500 italic py-6">Carregando painel de informações...</p>;
    }

    return (
        <div className="flex-1 flex flex-col space-y-6 min-h-0">
            {/* CARDS DE RESUMO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition">
                    <div className="p-3 bg-teal-50 text-teal-600 rounded-lg"><ClipboardList size={24} /></div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Itens no Catálogo</p>
                        <p className="text-2xl font-bold text-gray-900">{catalogSize}</p>
                    </div>
                </div>

                <div 
                    className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md hover:border-orange-200 transition cursor-pointer"
                    onClick={onNavigateToEstoqueBaixo}
                >
                    <div className="p-3 bg-orange-50 text-orange-500 rounded-lg"><TrendingDown size={24} /></div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Abaixo do Estoque</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.lowStockItems}</p>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><PackageSearch size={24} /></div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Retiradas Hoje</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.dispensationsToday}</p>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Users size={24} /></div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Pacientes Ativos</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.totalPatientsTreated}</p>
                    </div>
                </div>
            </div>

            {/* SEÇÃO INFERIOR: Atividades e Catálogo Resumido */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">

                {/* 1. Atividades Recentes */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-4 shrink-0">
                        <Clock size={20} className="text-gray-400" />
                        <h3 className="font-bold text-gray-800">Últimas Movimentações</h3>
                    </div>
                    {recentActivies.length === 0 ? (
                        <p className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg text-center">Nenhuma retirada recente registrada.</p>
                    ) : (
                        <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-2">
                            {recentActivies.map(act => (
                                <div key={act.id} className="flex items-center gap-3 border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                                    <div className="w-2 h-2 rounded-full bg-teal-400"></div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">
                                            {act.users?.name} <span className="font-normal text-gray-500">retirou</span> {act.dispensed_quantity} un <span className="font-normal text-gray-500">de</span> {act.medicine_catalog?.active_principle}
                                        </p>
                                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                                            {new Date(act.dispensed_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 2. Dica Rápida / Informações do Sistema */}
                <div className="bg-gradient-to-br from-teal-600 to-teal-800 p-6 rounded-xl shadow-sm text-white flex flex-col h-full min-h-[300px]">
                    <h3 className="font-bold text-xl mb-2 text-teal-50">Bem-vindo(a) ao Farmácia Mais</h3>
                    <p className="text-teal-100 text-lg mb-4 leading-relaxed">
                        Este painel é o coração do controle de suprimentos do sistema Hiperdiário. <br />
                        Aproveite as abas acima para repor estoques, validar as receitas e gerenciar o tratamento dos pacientes em tempo real de forma colaborativa com o aplicativo móvel deles.
                    </p>
                </div>

            </div>
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
    const { showNotification } = useNotification();
    const [activeTab, setActiveTab] = useState<'inicio' | 'estoque' | 'historico' | 'monitoramento' | 'pacientes'>('inicio');
    const [estoqueFilterParam, setEstoqueFilterParam] = useState('all');
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
            const { data } = await supabase.from('medicine_catalog').select('*').order('active_principle');
            if (data) setMedicines(data);
        };
        fetchMedicines();

        const fetchUbsName = async () => {
            if (!profile?.cnes) return;
            try {
                const { data } = await supabase
                    .from('cnes_establishments')
                    .select('name')
                    .eq('cnes_id', profile.cnes)
                    .maybeSingle();

                if (data?.name) {
                    setUbsName(CnesService.formatCnesDisplayName(data.name));
                }
            } catch (err) {
                console.error('Erro ao buscar nome da unidade:', err);
            }
        };

        fetchUbsName();
    }, [profile?.cnes]);

    const searchPatient = async () => {
        const queryStr = searchCpf.trim();
        if (!queryStr) return;

        const onlyDigits = queryStr.replace(/\D/g, '');
        const hasLetters = /[a-zA-Z]/.test(queryStr);

        if (onlyDigits.length > 0 && !hasLetters && onlyDigits.length < 11) {
            showNotification('warning', 'Digite o CPF completo (11 dígitos) para buscar por CPF.');
            return;
        }

        setSearching(true);
        setPatient(null);

        try {
            let query = supabase.from('patients').select('id, cpf, name, diseases');

            if (onlyDigits.length > 0 && !hasLetters) {
                query = query.eq('cpf', onlyDigits);
            } else {
                query = query.ilike('name', `%${queryStr}%`);
            }

            const { data, error } = await query;

            if (error) throw error;

            if (!data || data.length === 0) {
                showNotification('error', 'Paciente não encontrado.');
            } else if (data.length > 1) {
                showNotification('info', 'Múltiplos pacientes encontrados. Tente ser mais específico ou use o CPF.');
            } else {
                const p = data[0];
                setPatient({
                    id: p.id,
                    cpf: p.cpf,
                    name: p.name,
                    conditions: Array.isArray(p.diseases) ? p.diseases : []
                });

            }
        } catch (err: any) {
            console.error('Erro ao buscar paciente:', err);
            showNotification('error', 'Erro ao buscar paciente.');
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
        if (freq.includes('1x ao dia') || freq.includes('1x dia')) dailyQty = 1;
        else if (freq.includes('12/12h') || freq.includes('2x')) dailyQty = 2;
        else if (freq.includes('8/8h') || freq.includes('3x')) dailyQty = 3;
        else if (freq.includes('6/6h') || freq.includes('4x')) dailyQty = 4;

        if (dailyQty > 0) {
            setDispensedRaw((dailyQty * 30).toString());
        } else if (!freq) {
            setDispensedRaw('');
        }
    };

    // Computa a frequência numérica com base no label selecionado
    const computedFrequencyPerDay = useMemo(() => {
        const freq = usageFrequency.toLowerCase();
        if (freq.includes('1x ao dia') || freq.includes('1x dia')) return 1;
        if (freq.includes('12/12h') || freq.includes('2x')) return 2;
        if (freq.includes('8/8h') || freq.includes('3x')) return 3;
        if (freq.includes('6/6h') || freq.includes('4x')) return 4;
        if (usageFrequency === 'Outro' && dispensedRaw) {
            // Estima com base na quantidade mensal (ex: 90 / 30 = 3)
            const qty = parseInt(dispensedRaw) || 0;
            return qty >= 30 ? Math.round(qty / 30) : 1;
        }
        return 1; // Fallback
    }, [usageFrequency, dispensedRaw]);

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

        let text = `${dispensedQuantity} ${selectedMed.dispensing_unit}${dispensedQuantity > 1 ? 's' : ''}`;
        if (boxes > 0) {
            text += ` ➔ Aprox. ${boxes} caixa${boxes > 1 ? 's' : ''}`;
            if (remainder > 0) text += ` + ${remainder} unidade${remainder > 1 ? 's' : ''}`;
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
        today.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(today.getTime() - pDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return pDate <= today && diffDays <= 120;
    }, [prescriptionDate]);

    const handleDispense = async (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) return; // Previne múltiplos cliques
        if (!patient) return showNotification('error', 'Selecione o paciente.');
        if (!selectedMed) return showNotification('error', 'Selecione o medicamento.');
        if (dispensedQuantity <= 0) return showNotification('error', 'Quantidade inválida.');
        if (!isPrescriptionValid) return showNotification('error', 'Receita vencida (mais de 120 dias) ou data inválida.');
        if (!prescriptionDate || !doctorName) return showNotification('error', 'Preencha os dados da receita.');

        setSubmitting(true);
        try {
            const { error: insErr } = await supabase.rpc('dispense_and_deduct_stock', {
                p_patient_id: patient.id,
                p_catalog_id: selectedMed.id,
                p_ubs_cnes: profile?.cnes || '',
                p_quantity: dispensedQuantity,
                p_doctor_name: doctorName,
                p_prescription_date: prescriptionDate,
                p_frequency_per_day: computedFrequencyPerDay
            });

            if (insErr) {
                if (insErr.message.includes('Estoque insuficiente')) {
                    setSubmitting(false);
                    return showNotification('error', 'Estoque insuficiente para esta UBS.');
                }
                throw insErr;
            }

            showNotification('success', 'Dispensação registrada com sucesso!');
            // Reset form - Aguarda 2s e fecha, mantendo botão desabilitado
            setTimeout(() => {
                handleCloseModal();
                setSubmitting(false);
            }, 2000);
        } catch (err: any) {
            showNotification('error', err.message || 'Erro ao registrar.');
            setSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 [scrollbar-gutter:stable]">
            <nav className="bg-white shadow px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                        <Pill size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Painel da Farmácia</h1>
                        <p className="text-sm text-gray-500">Controle de estoque e dispensação de medicamentos.</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4">
                    <div className="text-center sm:text-right text-sm text-gray-500 flex flex-col">
                        {ubsName ? (
                            <span className="font-semibold text-gray-700">{ubsName} <span className="font-normal text-gray-400 ml-1">CNES {profile?.cnes}</span></span>
                        ) : (
                            profile?.cnes ? (
                                <span className="font-semibold text-gray-700">Unidade <span className="font-normal text-gray-400 ml-1">CNES {profile.cnes}</span></span>
                            ) : 'Unidade não informada'
                        )}
                        <span className="text-xs font-medium text-teal-600">{profile?.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white hover:bg-teal-700 transition font-bold text-xs shadow-lg shadow-teal-100">
                            <UserCheck size={16} /> Atualizar
                        </button>
                        <button onClick={handleLogout} className="flex items-center gap-1 text-red-600 hover:text-red-800 cursor-pointer text-sm font-bold">
                            <LogOut size={18} /> Sair
                        </button>
                    </div>
                </div>
            </nav>

            <main className="flex-1 w-full max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex flex-col min-h-0">
                <div className="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Dispensação e Estoque</h2>
                        <p className="text-sm text-gray-500 font-medium">
                            {ubsName || (profile?.cnes ? `UBS CNES ${profile.cnes}` : 'Unidade não identificada')}
                        </p>
                        <p className="text-sm text-gray-500">
                            Gerencie o fluxo de medicamentos da unidade em tempo real.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-teal-100 flex items-center justify-center gap-2 font-bold transition"
                    >
                        <Plus size={20} /> Nova Dispensação
                    </button>
                </div>

                <div className="flex border-b border-gray-200 mb-6 space-x-6 overflow-x-auto shrink-0">
                    <button
                        onClick={() => setActiveTab('inicio')}
                        className={`pb-3 font-medium text-sm border-b-2 transition whitespace-nowrap ${activeTab === 'inicio' ? 'border-teal-600 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        <div className="flex items-center gap-2"><Home size={18} /> Início (Resumo)</div>
                    </button>
                    <button
                        onClick={() => {
                            setEstoqueFilterParam('all');
                            setActiveTab('estoque');
                        }}
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
                    <button
                        onClick={() => setActiveTab('pacientes')}
                        className={`pb-3 font-medium text-sm border-b-2 transition whitespace-nowrap ${activeTab === 'pacientes' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        <div className="flex items-center gap-2"><Users size={18} /> Pacientes e Tratamentos</div>
                    </button>
                    <button
                        onClick={() => setActiveTab('monitoramento')}
                        className={`pb-3 font-medium text-sm border-b-2 transition whitespace-nowrap ${activeTab === 'monitoramento' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        <div className="flex items-center gap-2"><AlertCircle size={18} /> Alerta de Pacientes</div>
                    </button>
                </div>

                <div className="flex-1 flex flex-col min-h-0 w-full">
                    {activeTab === 'inicio' && (
                        <FarmaciaResumoDashboard 
                            cnes={profile?.cnes || ''} 
                            catalogSize={medicines.length} 
                            onNavigateToEstoqueBaixo={() => {
                                setEstoqueFilterParam('low_stock');
                                setActiveTab('estoque');
                            }}
                        />
                    )}
                    {activeTab === 'estoque' && (
                        <FarmaciaEstoque cnes={profile?.cnes || ''} catalog={medicines} initialFilter={estoqueFilterParam} />
                    )}
                    {activeTab === 'historico' && (
                        <FarmaciaHistorico cnes={profile?.cnes || ''} />
                    )}
                    {activeTab === 'pacientes' && (
                        <FarmaciaPacientes cnes={profile?.cnes || ''} />
                    )}
                    {activeTab === 'monitoramento' && (
                        <FarmaciaMonitoramento cnes={profile?.cnes || ''} />
                    )}
                </div>

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
                                <form onSubmit={handleDispense} className="space-y-6">
                                    {/* Buscador de Paciente */}
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                        <label className="block text-sm font-medium text-gray-700 mb-1 ">Buscar Paciente (CPF)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                maxLength={14}
                                                placeholder="000.000.000-00"
                                                className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2 border"
                                                value={searchCpf}
                                                onChange={e => setSearchCpf(formatCpf(e.target.value))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (!searching && searchCpf.replace(/\D/g, '').length === 11) searchPatient();
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={searchPatient}
                                                disabled={searching || searchCpf.replace(/\D/g, '').length < 11}
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
                                                    {/* Aplicar máscara ao CPF */}
                                                    <span className="text-sm opacity-80">(CPF: {formatCpf(patient.cpf || searchCpf)})</span>
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
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Frequência *</label>
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
                                            className="px-5 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[180px] gap-2"
                                        >
                                            {submitting ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : 'Confirmar Dispensação'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

