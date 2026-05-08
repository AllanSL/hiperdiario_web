import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Search, X, Pill, AlertCircle, Check, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCpf } from '../../lib/utils';

type Patient = {
  id: string;
  name: string;
  cpf: string;
  diseases?: string[] | string;
  phone?: string;
};

type Medicine = {
  id: string;
  medication_id: string;
  dispensation_id: string;
  catalog_id: string;
  active_principle: string;
  strength: string;
  form: string;
  category: string;
  dispensing_unit: string;
  dispensed_at: string;
  dispensed_quantity: number;
  frequency_label: string;
  prescribing_doctor: string;
  stock: number;
  frequency: string[];
};

const COMMON_DISEASES = [
  'Diabetes tipo 1',
  'Diabetes tipo 2',
  'Hipertensão',
];

export default function ProfissionalPacientes() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medicines, setMedicines] = useState<Record<string, Medicine[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [medicinesLoading, setMedicinesLoading] = useState<Set<string>>(new Set());
  const [clinicalNotes, setClinicalNotes] = useState<Record<string, any[]>>({});
  const [notesLoading, setNotesLoading] = useState<Set<string>>(new Set());
  const { showNotification } = useNotification();
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);
  const [editingDiseases, setEditingDiseases] = useState<string | null>(null);
  const [selectedDiseases, setSelectedDiseases] = useState<string[]>([]);

  const lastProfileIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only fetch when there's a real change in the profile id.
    if (!profile?.user_id) return;
    if (lastProfileIdRef.current === profile.user_id) return;
    lastProfileIdRef.current = profile.user_id;
    fetchPatients();
  }, [profile?.user_id]);



  const fetchPatients = async () => {
    try {
      setLoading(true);
      const filterQuery = searchQuery.trim();
      let query = supabase.from('patients').select('*').order('name', { ascending: true });

      if (filterQuery) {
        const numeric = filterQuery.replace(/\D/g, '');
        const hasLetters = /[a-zA-Z]/.test(filterQuery);

        if (numeric.length > 0 && !hasLetters && numeric.length < 11) {
          showNotification('warning', 'Digite o CPF completo (11 dígitos) para buscar por CPF.');
          setLoading(false);
          return;
        }

        if (numeric.length > 0) {
          query = query.or(`name.ilike.%${filterQuery}%,cpf.ilike.%${numeric}%`);
        } else {
          query = query.ilike('name', `%${filterQuery}%`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setPatients((data || []) as Patient[]);
    } catch (err) {
      console.error('Erro ao buscar pacientes:', err);
      showNotification('error', 'Erro ao buscar pacientes.');
    } finally {
      setLoading(false);
    }
  };

  // Handler explícito para buscar — limpa cache e fecha card somente quando o usuário buscar
  const handleSearch = async () => {
    // Limpa o cache de medicamentos, notas e fecha o card expandido
    setMedicines({});
    setClinicalNotes({});
    setExpandedPatient(null);
    await fetchPatients();
  };

  const fetchPatientMedicines = async (patientId: string) => {
    try {
      setMedicinesLoading(prev => new Set(prev).add(patientId));

      // Primeiro, busca o remote_id do paciente (UUID)
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('remote_id')
        .eq('id', patientId)
        .single();

      if (patientError || !patientData?.remote_id) {
        throw new Error('Paciente não encontrado');
      }

      // Busca os medicamentos ativos da tabela medications usando o remote_id
      const { data, error } = await supabase
        .from('medications')
        .select(`
          id,
          dispensation_id,
          stock,
          frequency,
          medicine_dispensations: dispensation_id (
            id,
            catalog_id,
            dispensed_quantity,
            frequency_label,
            prescribing_doctor,
            dispensed_at,
            medicine_catalog: catalog_id (
              active_principle,
              strength,
              form,
              category,
              dispensing_unit
            )
          )
        `)
        .eq('owner_id', patientData.remote_id)
        .not('dispensation_id', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedMedicines = (data || []).map((item: any) => {
        const dispData = item.medicine_dispensations;
        return {
          id: item.id,
          medication_id: item.id,
          dispensation_id: item.dispensation_id,
          catalog_id: dispData?.catalog_id,
          active_principle: dispData?.medicine_catalog?.active_principle || 'Desconhecido',
          strength: dispData?.medicine_catalog?.strength || '',
          form: dispData?.medicine_catalog?.form || '',
          category: dispData?.medicine_catalog?.category || '',
          dispensing_unit: dispData?.medicine_catalog?.dispensing_unit || '',
          dispensed_at: dispData?.dispensed_at,
          dispensed_quantity: dispData?.dispensed_quantity,
          frequency_label: dispData?.frequency_label,
          prescribing_doctor: dispData?.prescribing_doctor,
          stock: item.stock,
          frequency: item.frequency,
        };
      });

      setMedicines(prev => ({
        ...prev,
        [patientId]: formattedMedicines
      }));
    } catch (err) {
      console.error('Erro ao buscar medicamentos:', err);
      showNotification('error', 'Erro ao buscar medicamentos do paciente.');
    } finally {
      setMedicinesLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(patientId);
        return newSet;
      });
    }
  };

  const fetchClinicalNotes = async (patientId: string) => {
    try {
      setNotesLoading(prev => new Set(prev).add(patientId));
      const { data, error } = await supabase
        .from('clinical_notes')
        .select(`
          *,
          professionals ( name, specialty )
        `)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClinicalNotes(prev => ({ ...prev, [patientId]: data || [] }));
    } catch (err) {
      console.error('Erro ao buscar notas clínicas:', err);
    } finally {
      setNotesLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(patientId);
        return newSet;
      });
    }
  };

  const togglePatientExpanded = (patientId: string) => {
    if (expandedPatient === patientId) {
      setExpandedPatient(null);
    } else {
      setExpandedPatient(patientId);
      if (!medicines[patientId]) {
        fetchPatientMedicines(patientId);
      }
      if (!clinicalNotes[patientId]) {
        fetchClinicalNotes(patientId);
      }
    }
  };

  const startEditDiseases = (patient: Patient) => {
    setEditingDiseases(patient.id);
    // Garante que as doenças sejam um array válido e normalizado
    let patientDiseases: string[] = [];

    if (Array.isArray(patient.diseases)) {
      patientDiseases = patient.diseases
        .filter(d => d && typeof d === 'string')
        .map(d => d.trim());
    } else if (typeof patient.diseases === 'string') {
      patientDiseases = [patient.diseases.trim()];
    }

    setSelectedDiseases(patientDiseases);
  };

  const cancelEditDiseases = () => {
    setEditingDiseases(null);
    setSelectedDiseases([]);
  };

  const toggleDisease = (disease: string) => {
    setSelectedDiseases(prev =>
      prev.includes(disease)
        ? prev.filter(d => d !== disease)
        : [...prev, disease]
    );
  };

  const handleSaveDiseases = async (patientId: string) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('patients')
        .update({ diseases: selectedDiseases })
        .eq('id', patientId);

      if (error) throw error;
      showNotification('success', 'Condições/Doenças atualizadas com sucesso.');

      // Atualiza a lista local
      setPatients(prev =>
        prev.map(p =>
          p.id === patientId ? { ...p, diseases: selectedDiseases } : p
        )
      );

      cancelEditDiseases();
    } catch (err: any) {
      console.error('Erro ao salvar doenças:', err);
      showNotification('error', err.message || 'Erro ao salvar condições/doenças.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return dateString;
    }
  };

  const formatSearchInput = (value: string) => {
    const onlyDigits = value.replace(/\D/g, '');
    const hasLetters = /[a-zA-Z]/.test(value);
    
    if (onlyDigits.length > 0 && !hasLetters) {
      return formatCpf(value);
    }
    return value;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/profissional')} className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Pacientes</h1>
            <p className="text-sm text-gray-500">Visualize e edite as condições/doenças dos pacientes.</p>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-6 sm:px-6 lg:px-8">


        <section className="bg-white shadow rounded-lg p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Lista de pacientes</h2>
              <p className="text-sm text-gray-500">Pesquise por nome ou CPF. Clique para expandir e gerenciar.</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Buscar nome ou CPF"
                value={searchQuery}
                onChange={(e) => setSearchQuery(formatSearchInput(e.target.value))}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full sm:w-64 rounded-lg border border-gray-300 shadow-sm p-2 focus:border-indigo-500 focus:ring-indigo-500"
              />
              <button onClick={handleSearch} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 transition">
                <Search size={16} /> Buscar
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : patients.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-500">
                Nenhum paciente encontrado.
              </div>
            ) : (
              patients.map((patient) => (
                <div key={patient.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div
                    onClick={() => togglePatientExpanded(patient.id)}
                    className="px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer transition flex justify-between items-start"
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">{patient.name}</h3>
                      <p className="text-xs text-gray-500">CPF: {formatCpf(patient.cpf)}</p>
                      {patient.diseases && patient.diseases.length > 0 && (
                        <p className="text-xs text-indigo-600 mt-1">
                          {Array.isArray(patient.diseases) ? patient.diseases.join(', ') : patient.diseases}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Conteúdo Expandido */}
                  {expandedPatient === patient.id && (
                    <div className="px-4 py-4 bg-white border-t border-gray-200 space-y-6">
                      {/* Seção de Editar Doenças */}
                      <div>
                        <h4 className="font-semibold text-gray-800 mb-4">Condições / Doenças</h4>

                        {editingDiseases === patient.id ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                              {COMMON_DISEASES.map((disease) => (
                                <label key={disease} className="flex items-center p-2 border border-gray-200 rounded-lg hover:bg-indigo-50 cursor-pointer transition">
                                  <input
                                    type="checkbox"
                                    checked={selectedDiseases.some(d => d.trim() === disease.trim())}
                                    onChange={() => toggleDisease(disease)}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">{disease}</span>
                                </label>
                              ))}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSaveDiseases(patient.id)}
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition disabled:opacity-50"
                              >
                                <Check size={16} /> Salvar
                              </button>
                              <button
                                onClick={cancelEditDiseases}
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition"
                              >
                                <X size={16} /> Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {patient.diseases && (
                              <div className="flex flex-wrap gap-2 mb-4">
                                {(Array.isArray(patient.diseases) ? patient.diseases : [patient.diseases]).map((disease: string) => (
                                  <span key={disease} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                                    <Check size={14} /> {disease}
                                  </span>
                                ))}
                              </div>
                            )}
                            {!patient.diseases && (
                              <p className="text-gray-500 text-sm">Nenhuma condição registrada</p>
                            )}
                            <button
                              onClick={() => startEditDiseases(patient)}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition text-sm"
                            >
                              Editar Condições
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Seção de Medicamentos */}
                      <div className="border-t border-gray-200 pt-6">
                        {medicinesLoading.has(patient.id) ? (
                          <div className="flex items-center justify-center py-6">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                          </div>
                        ) : medicines[patient.id] && medicines[patient.id].length > 0 ? (
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                              <Pill size={18} className="text-indigo-600" />
                              Medicamentos Ativos
                            </h4>
                            <div className="space-y-3">
                              {medicines[patient.id].map((med) => (
                                <div key={med.medication_id} className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                                  <div className="flex justify-between items-start mb-1">
                                    <h5 className="font-medium text-gray-800">
                                      {med.active_principle} {med.strength}
                                    </h5>
                                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                                      Saldo: {med.stock} {med.dispensing_unit}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600 mb-1">
                                    Forma: <span className="font-medium">{med.form}</span> | Categoria: <span className="font-medium">{med.category}</span>
                                  </p>
                                  <p className="text-sm text-gray-600 mb-1">
                                    Quantidade Inicial: <span className="font-medium">{med.dispensed_quantity} {med.dispensing_unit}</span>
                                  </p>
                                  <p className="text-sm text-gray-600 mb-1">
                                    Frequência: <span className="font-medium">{med.frequency_label}</span>
                                  </p>
                                  {med.frequency && med.frequency.length > 0 && (
                                    <p className="text-xs text-gray-500 mb-1">
                                      Horários: {med.frequency.join(', ')}
                                    </p>
                                  )}
                                  <p className="text-xs text-gray-500">
                                    Prescritor: {med.prescribing_doctor} | Retirada em: {formatDate(med.dispensed_at)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center py-6 text-gray-500">
                            <AlertCircle size={18} className="mr-2" />
                            Nenhum medicamento ativo no momento.
                          </div>
                        )}
                      </div>

                      {/* Seção de Evoluções Clínicas */}
                      <div className="border-t border-gray-200 pt-6">
                        {notesLoading.has(patient.id) ? (
                          <div className="flex items-center justify-center py-6">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                          </div>
                        ) : clinicalNotes[patient.id] && clinicalNotes[patient.id].length > 0 ? (
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                              <Activity size={18} className="text-green-600" />
                              Histórico de Evoluções Clínicas
                            </h4>
                            <div className="space-y-4">
                              {clinicalNotes[patient.id].map((note) => (
                                <div key={note.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col">
                                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                        {new Date(note.created_at).toLocaleDateString('pt-BR')} às {new Date(note.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      <span className="text-sm font-semibold text-indigo-700">
                                        Dr(a). {note.professionals?.name || 'Profissional'}
                                        <span className="font-normal text-gray-500 ml-1">({note.professionals?.specialty || 'Clínico'})</span>
                                      </span>
                                    </div>
                                  </div>

                                  {/* Sinais Vitais */}
                                  {note.vital_signs && typeof note.vital_signs === 'object' && Object.keys(note.vital_signs).length > 0 && (
                                    <div className="flex flex-wrap gap-3 mb-3 p-2 bg-gray-50 rounded-md">
                                      {Object.entries(note.vital_signs).map(([key, val]) => (
                                        <div key={key} className="text-xs">
                                          <span className="text-gray-500 uppercase font-bold">{key.replace('_', ' ')}:</span>
                                          <span className="ml-1 text-gray-800 font-medium">{String(val)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-3">
                                    {note.content}
                                  </p>

                                  {note.attention_points && note.attention_points.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {note.attention_points.map((point: string, idx: number) => (
                                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-medium">
                                          <AlertCircle size={10} /> {point}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center py-6 text-gray-500">
                            <Activity size={18} className="mr-2" />
                            Nenhuma evolução clínica registrada.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
