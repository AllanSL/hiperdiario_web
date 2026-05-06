import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Edit, Trash2, Search, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Patient = {
  id: string;
  name: string;
  cpf: string;
  diseases?: string[];
  phone?: string;
};

type PatientForm = {
  id?: string;
  name: string;
  cpf: string;
  diseases: string;
  phone: string;
};

const defaultForm: PatientForm = {
  name: '',
  cpf: '',
  diseases: '',
  phone: ''
};

export default function RecepcionistaPacientes() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState<PatientForm>(defaultForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showNotification } = useNotification();

  useEffect(() => {
    fetchPatients();
  }, [profile]);



  const fetchPatients = async () => {
    try {
      setLoading(true);
      const filterQuery = searchQuery.trim();
      let query = supabase.from('patients').select('*').order('name', { ascending: true });

      if (filterQuery) {
        const numeric = filterQuery.replace(/\D/g, '');
        if (numeric.length > 0) {
          query = query.or(`name.ilike.%${filterQuery}%,cpf.eq.${numeric}`);
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

  const resetForm = () => {
    setForm(defaultForm);
    setEditing(false);
  };

  const mapFormToPayload = () => ({
    name: form.name.trim(),
    cpf: form.cpf.replace(/\D/g, ''),
    diseases: form.diseases
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    phone: form.phone.trim(),
  });

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();

    const cpfClean = form.cpf.replace(/\D/g, '');
    if (!form.name.trim() || cpfClean.length !== 11) {
      showNotification('error', 'Informe nome e CPF válido para o paciente.');
      return;
    }

    try {
      setSaving(true);
      const payload = mapFormToPayload();

      if (editing && form.id) {
        const { error } = await supabase
          .from('patients')
          .update(payload)
          .eq('id', form.id);

        if (error) throw error;
        showNotification('success', 'Paciente atualizado com sucesso.');
      } else {
        const { error } = await supabase.from('patients').insert([payload]);
        if (error) throw error;
        showNotification('success', 'Paciente cadastrado com sucesso.');
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
    setForm({
      id: patient.id,
      name: patient.name,
      cpf: patient.cpf,
      diseases: Array.isArray(patient.diseases) ? patient.diseases.join(', ') : patient.diseases || '',
      phone: patient.phone || '',

    });
    setEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja remover esse paciente permanentemente?')) return;
    try {
      setSaving(true);
      const { error } = await supabase.from('patients').delete().eq('id', id);
      if (error) throw error;
      showNotification('success', 'Paciente removido.');
      fetchPatients();
    } catch (err: any) {
      console.error('Erro ao remover paciente:', err);
      showNotification('error', err.message || 'Erro ao remover paciente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/recepcionista')} className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Pacientes</h1>
            <p className="text-sm text-gray-500">Cadastre, edite e remova pacientes da unidade.</p>
          </div>
        </div>
        <button onClick={() => { resetForm(); setSearchQuery(''); }} className="flex items-center gap-2 px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 transition">
          <Plus size={16} /> Novo paciente
        </button>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">


        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-6">
          <section className="bg-white shadow rounded-lg p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Lista de pacientes</h2>
                <p className="text-sm text-gray-500">Pesquise por nome ou CPF.</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Buscar nome ou CPF"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 rounded-lg border border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                />
                <button onClick={fetchPatients} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition">
                  <Search size={16} /> Buscar
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">CPF</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Condições</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">Carregando pacientes...</td>
                    </tr>
                  ) : patients.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">Nenhum paciente encontrado.</td>
                    </tr>
                  ) : (
                    patients.map((patient) => (
                      <tr key={patient.id}>
                        <td className="px-4 py-4 text-sm text-gray-700">{patient.name}</td>
                        <td className="px-4 py-4 text-sm text-gray-700">{patient.cpf}</td>
                        <td className="px-4 py-4 text-sm text-gray-700">{Array.isArray(patient.diseases) ? patient.diseases.join(', ') : patient.diseases || '—'}</td>
                        <td className="px-4 py-4 text-sm text-gray-700 space-x-2">
                          <button onClick={() => handleEdit(patient)} className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 transition">
                            <Edit size={16} /> Editar
                          </button>
                          <button onClick={() => handleDelete(patient.id)} className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700 transition">
                            <Trash2 size={16} /> Excluir
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{editing ? 'Editar paciente' : 'Cadastrar paciente'}</h2>
                <p className="text-sm text-gray-500">Preencha as informações para cadastrar ou atualizar.</p>
              </div>
              {editing && (
                <button onClick={resetForm} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition">
                  <X size={16} /> Cancelar
                </button>
              )}
            </div>
            <form onSubmit={handleSavePatient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">CPF</label>
                <input
                  type="text"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Condições / Doenças</label>
                <input
                  type="text"
                  value={form.diseases}
                  onChange={(e) => setForm({ ...form, diseases: e.target.value })}
                  placeholder="Diabetes, Hipertensão"
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Telefone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2 focus:border-green-500 focus:ring-green-500"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex justify-center rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition"
              >
                {saving ? 'Salvando...' : editing ? 'Atualizar paciente' : 'Cadastrar paciente'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

