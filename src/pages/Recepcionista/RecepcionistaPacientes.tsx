import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Edit, Search, Plus, X, ChevronDown, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCpf } from '../../lib/utils';
import { CnesService, type CnesEstabelecimento } from '../../lib/cnesService';
import { CustomSelect } from '../../components/CustomSelect';
import ufsData from '../../lib/municipios.json';
import { ViaCepService } from '../../lib/viaCepService';

type Patient = {
  id: string;
  name: string;
  cpf: string;
  birth_date?: string;
  gender?: string;
  phone?: string;
  email?: string;
  state_code?: string;
  city_ibge?: number;
  diseases?: string[];
  ubs_cnes?: string;
  zip_code?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  complement?: string;
  user_id?: string;
  emergency_contact?: {
    name: string;
    phone: string;
    relationship?: string;
  };
  cnes_establishments?: {
    name: string;
  };
};

type PatientForm = {
  id?: string;
  name: string;
  cpf: string;
  birth_date: string;
  gender: string;
  phone: string;
  email: string;
  state_code: string;
  city_ibge: string;
  ubs_cnes: string;
  emergency_name: string;
  emergency_phone: string;
  emergency_relationship: string;
  zip_code: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  user_id?: string;
  password?: string;
};

const RELATIONSHIP_OPTIONS = [
  'Cônjuge',
  'Mãe',
  'Pai',
  'Filho(a)',
  'Irmão(ã)',
  'Avô/Avó',
  'Tio(a)',
  'Outro',
];

const defaultForm: PatientForm = {
  name: '',
  cpf: '',
  birth_date: '',
  gender: '',
  phone: '',
  email: '',
  state_code: '',
  city_ibge: '',
  ubs_cnes: '',
  emergency_name: '',
  emergency_phone: '',
  emergency_relationship: '',
  zip_code: '',
  street: '',
  number: '',
  neighborhood: '',
  complement: '',
  user_id: '',
  password: '',
};

function formatDateDisplay(dateString?: string | null) {
  if (!dateString) return 'Data n/i';
  try {
    const [year, month, day] = dateString.split('-');
    if (!year || !month || !day) return dateString;
    return `${day}/${month}/${year}`;
  } catch (e) {
    return dateString;
  }
}

function formatPhone(phone?: string | null) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

function formatCep(cep?: string | number | null) {
  if (cep === undefined || cep === null) return '';
  const s = String(cep).replace(/\D/g, '');
  if (!s) return '';
  if (s.length <= 5) return s;
  return s.replace(/(\d{5})(\d{3})/, '$1-$2');
}

export default function RecepcionistaPacientes() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState<PatientForm>(defaultForm);
  const [editing, setEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalPatient, setOriginalPatient] = useState<Patient | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [typedBirthDate, setTypedBirthDate] = useState('');
  const { showNotification } = useNotification();

  // Location Selection State
  const [uf, setUf] = useState<number>(0);
  const [municipio, setMunicipio] = useState<number>(0);
  const [estabelecimentos, setEstabelecimentos] = useState<CnesEstabelecimento[]>([]);
  const [loadingUbs, setLoadingUbs] = useState(false);
  const [unitName, setUnitName] = useState<string>('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [miniCalendarMonth, setMiniCalendarMonth] = useState(new Date());

  useEffect(() => {
    if (profile?.user_id) {
      fetchPatients();
    }
  }, [profile?.user_id]);

  useEffect(() => {
    const fetchUnitInfo = async () => {
      if (!profile?.cnes) return;
      try {
        const { data } = await supabase
          .from('cnes_establishments')
          .select('name')
          .eq('cnes_id', profile.cnes)
          .maybeSingle();

        if (data?.name) {
          setUnitName(CnesService.formatCnesDisplayName(data.name));
        }
      } catch (err) {
        console.error('Erro ao buscar nome da unidade:', err);
      }
    };

    fetchUnitInfo();
  }, [profile?.cnes]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) {
        resetForm();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showModal]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const filterQuery = searchQuery.trim();
      let query = supabase.from('patients').select('*, cnes_establishments(name)').order('name', { ascending: true });

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

  const handleCepBlur = async (cep: string) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;

    try {
      const data = await ViaCepService.buscarEndereco(digits);

      // Sync local UF and Municipio states to enable UBS fetching
      const state = ufsData.find(u => u.sigla === data.uf);
      if (state) {
        setUf(state.id_uf);
        // Ibge code in viaCep is 7 digits, same as in our municipios.json
        const cityId = Number(data.ibge);
        const city = state.municipios.find(m => m.id_municipio === cityId);

        if (city) {
          setMunicipio(city.id_municipio);
          handleBuscarEstabelecimentos(state.id_uf, city.id_municipio);
        }

        setForm(prev => ({
          ...prev,
          state_code: data.uf,
          city_ibge: cityId.toString(),
          street: data.logradouro,
          neighborhood: data.bairro,
          zip_code: digits.replace(/(\d{5})(\d{3})/, '$1-$2')
        }));
      }
    } catch (err) {
      console.error('Erro ao buscar CEP:', err);
      showNotification('error', 'CEP não encontrado ou erro na busca.');
    }
  };

  const handleBuscarEstabelecimentos = async (ufCode: number, cityCode: number) => {
    if (!ufCode || !cityCode) return;
    setLoadingUbs(true);
    try {
      const data = await CnesService.buscarEstabelecimentos(ufCode, cityCode);
      setEstabelecimentos(data);
    } catch (e) {
      showNotification('error', 'Erro ao buscar UBS');
    }
    setLoadingUbs(false);
  };

  const resetForm = () => {
    setForm(defaultForm);
    setTypedBirthDate('');
    setEditing(false);
    setShowModal(false);
    setOriginalPatient(null);
    setFormErrors([]);
    setUf(0);
    setMunicipio(0);
    setEstabelecimentos([]);
    setActiveDropdown(null);
  };

  const mapFormToPayload = () => ({
    name: form.name.trim(),
    cpf: form.cpf.replace(/\D/g, ''),
    birth_date: form.birth_date || null,
    gender: form.gender || null,
    phone: form.phone.replace(/\D/g, ''),
    email: form.email.trim() || null,
    state_code: form.state_code.trim() || null,
    city_ibge: parseInt(form.city_ibge) || null,
    ubs_cnes: form.ubs_cnes || profile?.cnes || null,
    emergency_contact: {
      name: form.emergency_name.trim(),
      phone: form.emergency_phone.replace(/\D/g, ''),
      relationship: form.emergency_relationship
    },
    zip_code: form.zip_code.replace(/\D/g, '') || null,
    street: form.street.trim() || null,
    number: form.number.trim() || null,
    neighborhood: form.neighborhood.trim() || null,
    complement: form.complement.trim() || null,
  });

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: string[] = [];
    const cpfClean = form.cpf.replace(/\D/g, '');

    if (!form.name.trim()) errors.push('name');
    if (cpfClean.length !== 11) errors.push('cpf');
    if (!form.birth_date) errors.push('birth_date');
    if (!form.gender) errors.push('gender');
    if (!form.phone.replace(/\D/g, '')) errors.push('phone');
    if (!form.state_code) errors.push('state_code');
    if (!form.city_ibge) errors.push('city_ibge');
    if (!form.ubs_cnes) errors.push('ubs_cnes');
    if (form.zip_code.replace(/\D/g, '').length !== 8) errors.push('zip_code');

    // Validação de Senha: obrigatória para novos, e no mínimo 6 caracteres se preenchida
    if (!editing && (!form.password || form.password.length < 6)) {
      errors.push('password');
    } else if (editing && form.password && form.password.length < 6) {
      errors.push('password');
    }

    setFormErrors(errors);

    if (errors.length > 0) {
      const passwordErrorOnly = errors.length === 1 && errors[0] === 'password' && form.password;
      if (passwordErrorOnly) {
        showNotification('error', 'A senha deve ter no mínimo 6 caracteres.');
      } else {
        showNotification('error', 'Por favor, preencha todos os campos obrigatórios em destaque.');
      }

      // Focar no primeiro campo com erro
      setTimeout(() => {
        const firstError = (document.querySelector(`[name="${errors[0]}"]`) || document.querySelector(`[data-name="${errors[0]}"]`)) as HTMLElement;
        if (firstError) {
          firstError.focus();
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    const payload = mapFormToPayload();

    // Impedir envio se não houve alterações na edição
    if (editing && originalPatient) {
      const originalPayload = {
        name: originalPatient.name.trim(),
        cpf: originalPatient.cpf.replace(/\D/g, ''),
        birth_date: originalPatient.birth_date || null,
        gender: originalPatient.gender || null,
        phone: originalPatient.phone?.replace(/\D/g, '') || '',
        email: originalPatient.email?.trim() || null,
        state_code: originalPatient.state_code?.trim() || null,
        city_ibge: originalPatient.city_ibge || null,
        ubs_cnes: originalPatient.ubs_cnes || null,
        emergency_contact: {
          name: originalPatient.emergency_contact?.name?.trim() || '',
          phone: originalPatient.emergency_contact?.phone?.replace(/\D/g, '') || '',
          relationship: originalPatient.emergency_contact?.relationship || ''
        },
        zip_code: originalPatient.zip_code?.replace(/\D/g, '') || null,
        street: originalPatient.street?.trim() || null,
        number: originalPatient.number?.trim() || null,
        neighborhood: originalPatient.neighborhood?.trim() || null,
        complement: originalPatient.complement?.trim() || null,
      };

      if (JSON.stringify(payload) === JSON.stringify(originalPayload) && !form.password) {
        showNotification('info', 'Nenhuma alteração foi realizada.');
        return;
      }
    }

    try {
      setSaving(true);
      if (editing && form.id) {
        // 1. Atualizar dados clínicos
        const { error: patientError } = await supabase
          .from('patients')
          .update(payload)
          .eq('id', form.id);

        if (patientError) throw patientError;

        // 2. Lógica de Login (Auth)
        if (form.password) {
          // Se não tem user_id, precisamos CRIAR o login (mesmo em modo de edição)
          if (!form.user_id) {
            const { data, error: authError } = await supabase.functions.invoke('manage-patient-auth', {
              body: {
                action: 'create',
                cpf: cpfClean,
                password: form.password,
                patientData: payload // Passamos os dados para garantir o vínculo no upsert
              }
            });
            if (authError || data?.error) throw new Error(authError?.message || data?.error || 'Erro ao criar login para paciente existente');
          } else {
            // Se já tem user_id, apenas atualizamos a senha
            const { data, error: authError } = await supabase.functions.invoke('manage-patient-auth', {
              body: {
                action: 'update',
                userId: form.user_id,
                password: form.password
              }
            });
            if (authError || data?.error) throw new Error(authError?.message || data?.error || 'Erro ao atualizar senha');
          }
        }

        showNotification('success', 'Paciente atualizado com sucesso.');
      } else {
        // Para novos cadastros, usar a Edge Function
        const { data, error } = await supabase.functions.invoke('manage-patient-auth', {
          body: {
            action: 'create',
            cpf: cpfClean,
            password: form.password,
            patientData: payload
          }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        showNotification('success', 'Paciente e login criados com sucesso.');
      }

      resetForm();
      fetchPatients();
    } catch (err: any) {
      console.error('Erro ao salvar paciente:', err);
      showNotification('error', err.message || 'Erro ao salvar paciente.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (patient: Patient) => {
    setOriginalPatient(patient);
    setFormErrors([]);
    setForm({
      id: patient.id,
      name: patient.name,
      cpf: formatCpf(patient.cpf),
      birth_date: patient.birth_date || '',
      gender: patient.gender || '',
      phone: formatPhone(patient.phone),
      email: patient.email || '',
      state_code: patient.state_code || '',
      city_ibge: patient.city_ibge?.toString() || '',
      ubs_cnes: patient.ubs_cnes || '',
      emergency_name: patient.emergency_contact?.name || '',
      emergency_phone: formatPhone(patient.emergency_contact?.phone),
      emergency_relationship: patient.emergency_contact?.relationship || '',
      zip_code: formatCep(patient.zip_code),
      street: patient.street || '',
      number: patient.number || '',
      neighborhood: patient.neighborhood || '',
      complement: patient.complement || '',
      user_id: patient.user_id || '',
      password: '', // Não carregamos a senha atual por segurança
    });

    if (patient.birth_date) {
      const [y, m, d] = patient.birth_date.split('-');
      setTypedBirthDate(`${d}/${m}/${y}`);
    }

    // Initialize location state for editing
    if (patient.state_code) {
      const state = ufsData.find(u => u.sigla === patient.state_code);
      if (state) {
        setUf(state.id_uf);
        if (patient.city_ibge) {
          setMunicipio(Number(patient.city_ibge));
          // Search UBS for this city automatically
          handleBuscarEstabelecimentos(state.id_uf, Number(patient.city_ibge));
        }
      }
    }

    setEditing(true);
    // Pequeno delay para suavizar a abertura e permitir que a busca da UBS inicie
    setTimeout(() => {
      setShowModal(true);
    }, 250);
  };


  return (
    <div className="flex flex-col min-h-screen bg-gray-50 [scrollbar-gutter:stable]">
      <nav className="bg-white shadow px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/recepcionista')} className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Pacientes</h1>
            <p className="text-sm text-gray-500">Gerencie o cadastro de pacientes da unidade.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
          <div className="text-center sm:text-right text-sm text-gray-500 flex flex-col">
            {unitName ? (
              <span className="font-semibold text-gray-700">{unitName} <span className="font-normal text-gray-400 ml-1">CNES {profile?.cnes}</span></span>
            ) : (
              profile?.cnes ? (
                <span className="font-semibold text-gray-700">UBS CNES <span className="font-normal text-gray-400 ml-1">{profile.cnes}</span></span>
              ) : 'Unidade não informada'
            )}
            <span className="text-xs font-medium text-blue-600">{profile?.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchPatients} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-white hover:bg-blue-700 transition font-bold text-sm shadow-lg shadow-blue-100">
              <Calendar size={18} /> Atualizar Lista
            </button>
          </div>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition shadow-lg shadow-green-100"
          >
            <Plus size={20} /> Cadastrar Paciente
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <section className="bg-white shadow-sm border border-gray-100 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Lista de Pacientes</h2>
              <p className="text-sm text-gray-500">Busque pacientes por nome ou CPF.</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Nome ou CPF..."
                  value={searchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setSearchQuery('');
                      return;
                    }
                    const firstChar = val[0];
                    if (/[0-9]/.test(firstChar)) {
                      // Modo CPF
                      const onlyDigits = val.replace(/\D/g, '');
                      setSearchQuery(formatCpf(onlyDigits).slice(0, 14));
                    } else {
                      // Modo Nome
                      const onlyLetters = val.replace(/[0-9]/g, '');
                      setSearchQuery(onlyLetters.slice(0, 30));
                    }
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && fetchPatients()}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-4 focus:ring-green-50 shadow-sm transition-all"
                />
              </div>
              <button
                onClick={fetchPatients}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-800 px-6 py-2.5 text-white font-bold hover:bg-black transition shadow-lg shadow-gray-100"
              >
                Buscar
              </button>
            </div>
          </div>

          <div className="overflow-hidden border border-gray-100 rounded-xl">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Paciente</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">CPF / Telefone</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">UBS</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">Carregando pacientes...</td>
                  </tr>
                ) : patients.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">Nenhum paciente encontrado.</td>
                  </tr>
                ) : (
                  patients.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{p.name.toUpperCase()}</p>
                            <p className="text-xs text-gray-500">{p.gender?.toUpperCase() || 'Não informado'} • {formatDateDisplay(p.birth_date)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm text-gray-700 font-medium">{formatCpf(p.cpf)}</p>
                        <p className="text-xs text-gray-500">{formatPhone(p.phone) || 'Sem telefone'}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {p.cnes_establishments?.name
                          ? CnesService.formatCnesDisplayName(p.cnes_establishments.name)
                          : p.ubs_cnes || 'Não vinculada'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleEdit(p)}
                          className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 font-bold text-sm transition px-3 py-1.5 hover:bg-green-50 rounded-lg"
                        >
                          <Edit size={16} /> Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Modal de Cadastro/Edição */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-500">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800">
                {editing ? 'Editar Informações do Paciente' : 'Cadastro de Paciente'}
              </h3>
              <button onClick={resetForm} className="p-2 hover:bg-gray-200 rounded-full transition">
                <X size={24} className="text-gray-500" />
              </button>
            </div>

            <form
              onSubmit={handleSavePatient}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
                  e.preventDefault();
                }
              }}
              className="p-6 max-h-[85vh] overflow-y-auto pb-10"
            >
              {/* Seção 1: Dados Pessoais */}
              <div className="mb-8">
                <h4 className="text-xs font-bold text-green-700 mb-4 flex items-center gap-2 tracking-[0.2em]">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  DADOS PESSOAIS
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Nome Completo</label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={(e) => {
                        setForm({ ...form, name: e.target.value });
                        if (formErrors.includes('name')) setFormErrors(prev => prev.filter(f => f !== 'name'));
                      }}
                      maxLength={100}
                      className={`w-full rounded-xl border p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all font-medium ${formErrors.includes('name') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 text-gray-900'
                        }`}
                      placeholder="Nome completo do paciente"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">CPF</label>
                    <input
                      type="text"
                      name="cpf"
                      value={form.cpf}
                      onChange={(e) => {
                        setForm({ ...form, cpf: formatCpf(e.target.value) });
                        if (formErrors.includes('cpf')) setFormErrors(prev => prev.filter(f => f !== 'cpf'));
                      }}
                      maxLength={14}
                      className={`w-full rounded-xl border p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all font-medium ${formErrors.includes('cpf') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 text-gray-900'
                        }`}
                      placeholder="000.000.000-00"
                    />
                  </div>

                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Data de Nascimento</label>
                    <div className="relative">
                      <input
                        type="text"
                        name="birth_date"
                        value={typedBirthDate}
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.length > 8) val = val.slice(0, 8);

                          // Aplica máscara DD/MM/AAAA
                          let formatted = val;
                          if (val.length > 2) formatted = val.slice(0, 2) + '/' + val.slice(2);
                          if (val.length > 4) formatted = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4);

                          setTypedBirthDate(formatted);

                          if (val.length === 8) {
                            const d = val.slice(0, 2);
                            const m = val.slice(2, 4);
                            const y = val.slice(4);
                            const iso = `${y}-${m}-${d}`;
                            setForm({ ...form, birth_date: iso });
                            setMiniCalendarMonth(new Date(Number(y), Number(m) - 1, 1));
                          }

                          if (formErrors.includes('birth_date')) setFormErrors(prev => prev.filter(f => f !== 'birth_date'));
                        }}
                        className={`w-full rounded-xl border p-3 pr-12 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all font-medium ${formErrors.includes('birth_date') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 text-gray-900'
                          }`}
                        placeholder="DD/MM/AAAA"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          setActiveDropdown(activeDropdown === 'birth_date' ? null : 'birth_date');
                          if (form.birth_date) {
                            const [y, m] = form.birth_date.split('-');
                            setMiniCalendarMonth(new Date(Number(y), Number(m) - 1, 1));
                          }
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-green-600 transition"
                      >
                        <Calendar size={20} />
                      </button>
                    </div>

                    {activeDropdown === 'birth_date' && (
                      <div className="absolute z-[60] mt-2 right-0 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 animate-in fade-in zoom-in duration-200">
                        {/* Mini Calendário */}
                        <div className="w-64">
                          <div className="flex items-center justify-between mb-4">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMiniCalendarMonth(new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() - 1, 1)); }}
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              <ChevronDown size={18} className="rotate-90 text-gray-400" />
                            </button>
                            <span className="text-sm font-bold text-gray-700">
                              {miniCalendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMiniCalendarMonth(new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() + 1, 1)); }}
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              <ChevronDown size={18} className="-rotate-90 text-gray-400" />
                            </button>
                          </div>

                          <div className="grid grid-cols-7 gap-1 mb-2">
                            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => (
                              <div key={d} className="text-[10px] font-bold text-gray-400 text-center">{d}</div>
                            ))}
                          </div>

                          <div className="grid grid-cols-7 gap-1">
                            {(() => {
                              const days = [];
                              const firstDay = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), 1).getDay();
                              const lastDay = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() + 1, 0).getDate();

                              for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} />);

                              for (let i = 1; i <= lastDay; i++) {
                                const date = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), i);
                                const iso = date.toISOString().split('T')[0];
                                const isSelected = form.birth_date === iso;
                                const isToday = new Date().toISOString().split('T')[0] === iso;

                                days.push(
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                      setForm({ ...form, birth_date: iso });
                                      const d = i.toString().padStart(2, '0');
                                      const m = (miniCalendarMonth.getMonth() + 1).toString().padStart(2, '0');
                                      const y = miniCalendarMonth.getFullYear();
                                      setTypedBirthDate(`${d}/${m}/${y}`);
                                      setActiveDropdown(null);
                                    }}
                                    className={`
                                      h-8 w-8 text-xs font-bold rounded-lg transition-all flex items-center justify-center
                                      ${isSelected ? 'bg-green-600 text-white shadow-lg' : isToday ? 'bg-green-50 text-green-600 border border-green-200' : 'text-gray-600 hover:bg-gray-100'}
                                    `}
                                  >
                                    {i}
                                  </button>
                                );
                              }
                              return days;
                            })()}
                          </div>
                          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                            <select
                              value={miniCalendarMonth.getFullYear()}
                              onChange={(e) => setMiniCalendarMonth(new Date(Number(e.target.value), miniCalendarMonth.getMonth(), 1))}
                              className="text-xs font-bold text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none"
                            >
                              {Array.from({ length: 120 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMiniCalendarMonth(new Date()); }}
                              className="text-[10px] font-bold text-green-600 hover:underline"
                            >
                              HOJE
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Sexo</label>
                    <div
                      data-name="gender"
                      className={`rounded-xl transition-all ${formErrors.includes('gender') ? 'ring-2 ring-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.1)]' : 'outline-none'}`}
                    >
                      <CustomSelect
                        value={form.gender.toLowerCase()}
                        onChange={(val) => {
                          setForm({ ...form, gender: val.toString() });
                          if (formErrors.includes('gender')) setFormErrors(prev => prev.filter(f => f !== 'gender'));
                        }}
                        placeholder="Selecione..."
                        searchable={false}
                        options={[
                          { value: 'masculino', label: 'Masculino' },
                          { value: 'feminino', label: 'Feminino' },
                          { value: 'outro', label: 'Outro' }
                        ]}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Telefone</label>
                    <input
                      type="text"
                      name="phone"
                      value={form.phone}
                      onChange={(e) => {
                        setForm({ ...form, phone: formatPhone(e.target.value) });
                        if (formErrors.includes('phone')) setFormErrors(prev => prev.filter(f => f !== 'phone'));
                      }}
                      maxLength={15}
                      className={`w-full rounded-xl border p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all font-medium ${formErrors.includes('phone') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 text-gray-900'
                        }`}
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      maxLength={100}
                      className="w-full rounded-xl border border-gray-200 p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all bg-gray-50 text-gray-900 font-medium"
                      placeholder="email@exemplo.com"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 2: Localização e Vínculo */}
              <div className="mb-8">
                <h4 className="text-xs font-bold text-green-700 mb-4 flex items-center gap-2 tracking-[0.2em]">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  LOCALIZAÇÃO E VÍNCULO
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">CEP</label>
                    <input
                      type="text"
                      name="zip_code"
                      value={form.zip_code}
                      onChange={(e) => {
                        setForm({ ...form, zip_code: e.target.value.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2') });
                        if (formErrors.includes('zip_code')) setFormErrors(prev => prev.filter(f => f !== 'zip_code'));
                      }}
                      onBlur={(e) => handleCepBlur(e.target.value)}
                      maxLength={9}
                      className={`w-full rounded-xl border p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all font-medium ${formErrors.includes('zip_code') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 text-gray-900'
                        }`}
                      placeholder="00000-000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Bairro</label>
                    <input
                      type="text"
                      value={form.neighborhood}
                      onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all bg-gray-50 text-gray-900 font-medium"
                      placeholder="Bairro"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Logradouro (Rua/Av)</label>
                    <input
                      type="text"
                      value={form.street}
                      onChange={(e) => setForm({ ...form, street: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all bg-gray-50 text-gray-900 font-medium"
                      placeholder="Nome da rua ou avenida"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Número</label>
                    <input
                      type="text"
                      value={form.number}
                      onChange={(e) => setForm({ ...form, number: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all bg-gray-50 text-gray-900 font-medium"
                      placeholder="Nº"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Complemento</label>
                    <input
                      type="text"
                      value={form.complement}
                      onChange={(e) => setForm({ ...form, complement: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all bg-gray-50 text-gray-900 font-medium"
                      placeholder="Apto, Bloco, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Estado (UF)</label>
                    <div
                      data-name="state_code"
                      className={`rounded-xl transition-all ${formErrors.includes('state_code') ? 'ring-2 ring-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.1)]' : 'outline-none'}`}
                    >
                      <CustomSelect
                        value={uf || ''}
                        onChange={(val) => {
                          const ufId = Number(val);
                          setUf(ufId);
                          const state = ufsData.find(u => u.id_uf === ufId);
                          setForm({ ...form, state_code: state?.sigla || '', city_ibge: '', ubs_cnes: '' });
                          setMunicipio(0);
                          setEstabelecimentos([]);
                          if (formErrors.includes('state_code')) setFormErrors(prev => prev.filter(f => f !== 'state_code'));
                        }}
                        placeholder="Selecione o Estado"
                        options={ufsData.map(u => ({ value: u.id_uf, label: `${u.sigla} - ${u.nome}` }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Município</label>
                    <div
                      data-name="city_ibge"
                      className={`rounded-xl transition-all ${formErrors.includes('city_ibge') ? 'ring-2 ring-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.1)]' : 'outline-none'}`}
                    >
                      <CustomSelect
                        value={municipio || ''}
                        disabled={!uf}
                        onChange={(val) => {
                          const cityId = Number(val);
                          setMunicipio(cityId);
                          setForm({ ...form, city_ibge: cityId.toString(), ubs_cnes: '' });
                          handleBuscarEstabelecimentos(uf, cityId);
                          if (formErrors.includes('city_ibge')) setFormErrors(prev => prev.filter(f => f !== 'city_ibge'));
                        }}
                        placeholder="Selecione a Cidade"
                        options={
                          ufsData.find(u => u.id_uf === uf)?.municipios.map(m => ({
                            value: m.id_municipio,
                            label: m.nome
                          })) || []
                        }
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Unidade de Saúde (UBS)</label>
                    <div
                      data-name="ubs_cnes"
                      className={`rounded-xl transition-all ${formErrors.includes('ubs_cnes') ? 'ring-2 ring-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.1)]' : 'outline-none'}`}
                    >
                      <CustomSelect
                        value={form.ubs_cnes}
                        disabled={!municipio || loadingUbs}
                        onChange={(val) => {
                          setForm({ ...form, ubs_cnes: val.toString() });
                          if (formErrors.includes('ubs_cnes')) setFormErrors(prev => prev.filter(f => f !== 'ubs_cnes'));
                        }}
                        placeholder={loadingUbs ? "Carregando unidades..." : "Selecione a UBS"}
                        options={
                          loadingUbs && form.ubs_cnes
                            ? [{ value: form.ubs_cnes, label: `Buscando: ${form.ubs_cnes}...` }, ...estabelecimentos.map(e => ({
                              value: e.codigoCnes.toString(),
                              label: `${e.codigoCnes} - ${e.nomeFantasia}`
                            }))]
                            : estabelecimentos.map(e => ({
                              value: e.codigoCnes.toString(),
                              label: `${e.codigoCnes} - ${e.nomeFantasia}`
                            }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 3: Contato de Emergência */}
              <div className="mb-2">
                <h4 className="text-xs font-bold text-green-700 mb-4 flex items-center gap-2 tracking-[0.2em]">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  CONTATO DE EMERGÊNCIA (OPCIONAL)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Nome do Contato</label>
                    <input
                      type="text"
                      name="emergency_name"
                      value={form.emergency_name}
                      onChange={(e) => {
                        setForm({ ...form, emergency_name: e.target.value });
                        setFormErrors(prev => prev.filter(f => f !== 'emergency_name'));
                      }}
                      maxLength={100}
                      className={`w-full rounded-xl border p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all font-medium ${formErrors.includes('emergency_name') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 text-gray-900'}`}
                      placeholder="Ex: Fulano da Silva"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Telefone de Emergência</label>
                    <input
                      type="text"
                      name="emergency_phone"
                      value={form.emergency_phone}
                      onChange={(e) => {
                        setForm({ ...form, emergency_phone: formatPhone(e.target.value) });
                        setFormErrors(prev => prev.filter(f => f !== 'emergency_phone'));
                      }}
                      maxLength={15}
                      className={`w-full rounded-xl border p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all font-medium ${formErrors.includes('emergency_phone') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 text-gray-900'}`}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Parentesco</label>
                    <div
                      data-name="emergency_relationship"
                      className={`rounded-xl transition-all ${formErrors.includes('emergency_relationship') ? 'ring-2 ring-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.1)]' : 'outline-none'}`}
                    >
                      <CustomSelect
                        value={form.emergency_relationship}
                        onChange={(val) => {
                          setForm({ ...form, emergency_relationship: val.toString() });
                          if (formErrors.includes('emergency_relationship')) setFormErrors(prev => prev.filter(f => f !== 'emergency_relationship'));
                        }}
                        placeholder="Selecione..."
                        searchable={false}
                        forceDirection="down"

                        options={RELATIONSHIP_OPTIONS.map(opt => ({ value: opt, label: opt }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 4: Dados de Acesso */}
              <div className="mt-8">
                <h4 className="text-xs font-bold text-green-700 mb-4 flex items-center gap-2 tracking-[0.2em]">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  DADOS DE ACESSO AO APP
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">CPF</label>
                    <input
                      type="text"
                      disabled
                      value={form.cpf ? formatCpf(form.cpf) : 'Preencha o CPF acima'}
                      className="w-full rounded-xl border border-gray-200 p-3 bg-gray-100 text-gray-500 font-medium cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                      {editing ? 'Alterar Senha (opcional)' : 'Senha Inicial do Paciente'}
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={form.password}
                      autoComplete="new-password"
                      onChange={(e) => {
                        setForm({ ...form, password: e.target.value });
                        if (formErrors.includes('password')) setFormErrors(prev => prev.filter(f => f !== 'password'));
                      }}
                      className={`w-full rounded-xl border p-3 focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all font-medium ${formErrors.includes('password') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 text-gray-900'}`}
                      placeholder={editing ? "Deixe em branco para manter" : "Mínimo 6 caracteres"}
                    />
                    {editing && !form.user_id && (
                      <p className="mt-2 text-[14px] text-amber-600 font-bold flex items-center gap-1">
                        ⚠️ Este paciente ainda não possui login criado.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-[2] px-4 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition shadow-lg shadow-green-100 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : editing ? 'Atualizar Dados' : 'Finalizar Cadastro'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}

