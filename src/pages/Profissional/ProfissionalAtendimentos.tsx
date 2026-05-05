import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, UserCheck, CheckCircle, XCircle, Clock, Save, AlertTriangle, Pill, X, Plus, Heart, Thermometer, Activity, Scale, History, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { STATUS_CONFIG } from '../../lib/database.types';
import type { VitalSigns, ClinicalNote } from '../../lib/database.types';

type Patient = { id: string; name: string; cpf: string; diseases?: string[]; remote_id?: string };
type Medicine = { id: string; active_principle: string; strength: string; form: string; stock: number; dispensing_unit: string; frequency_label: string };
type Appointment = {
  id: string; date_time: string; status: string | null; shift?: string;
  checked_in_at?: string | null; notes?: string; patient_id?: string;
  patients?: Patient | Patient[];
};

const formatCPF = (cpf: string) => {
  if (!cpf) return '';
  const d = cpf.replace(/\D/g, '');
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
};

const getStatusConfig = (status: string | null, hasCheckedIn: boolean) => {
  if (!status || status === 'scheduled') {
    return hasCheckedIn ? STATUS_CONFIG.checked_in : STATUS_CONFIG.scheduled;
  }
  return STATUS_CONFIG[status] || STATUS_CONFIG.scheduled;
};

export default function ProfissionalAtendimentos() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal state
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  const [clinicalContent, setClinicalContent] = useState('');
  const [attentionPoints, setAttentionPoints] = useState<string[]>([]);
  const [newPoint, setNewPoint] = useState('');
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({});
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [patientDiseases, setPatientDiseases] = useState<string[]>([]);
  const [pastNotes, setPastNotes] = useState<ClinicalNote[]>([]);
  const [saving, setSaving] = useState(false);
  const [medsLoading, setMedsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => { if (profile?.cns) fetchAppointments(); }, [profile]);
  useEffect(() => { if (!notification) return; const t = setTimeout(() => setNotification(null), 4000); return () => clearTimeout(t); }, [notification]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const hoje = new Date().toLocaleDateString('en-CA');
      const { data, error } = await supabase
        .from('appointments')
        .select('id, date_time, status, shift, checked_in_at, notes, patient_id, patients ( id, name, cpf, diseases )')
        .eq('professional_cns', profile?.cns)
        .gte('date_time', `${hoje}T00:00:00`).lte('date_time', `${hoje}T23:59:59`)
        .order('checked_in_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setAppointments((data || []) as Appointment[]);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Erro ao carregar atendimentos.' });
    } finally { setLoading(false); }
  };

  const getPatient = (apt: Appointment): Patient | null => {
    if (!apt.patients) return null;
    return Array.isArray(apt.patients) ? apt.patients[0] : apt.patients;
  };

  const sortedByShift = (shift: string) => {
    const filtered = appointments.filter(a => a.shift === shift);
    const order: Record<string, number> = { checked_in: 0, scheduled: 1, attended: 2, missed: 3 };
    return filtered.sort((a, b) => {
      const statusA = a.status === 'scheduled' && a.checked_in_at ? 'checked_in' : (a.status || 'scheduled');
      const statusB = b.status === 'scheduled' && b.checked_in_at ? 'checked_in' : (b.status || 'scheduled');
      
      const oa = order[statusA] ?? 1;
      const ob = order[statusB] ?? 1;
      
      if (oa !== ob) return oa - ob;
      if (a.checked_in_at && b.checked_in_at) return new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime();
      if (a.checked_in_at) return -1;
      if (b.checked_in_at) return 1;
      return 0;
    });
  };

  const morningApts = useMemo(() => sortedByShift('morning'), [appointments]);
  const afternoonApts = useMemo(() => sortedByShift('afternoon'), [appointments]);

  // Open consultation modal
  const openConsultation = async (apt: Appointment) => {
    const patient = getPatient(apt);
    setSelectedApt(apt);
    setPatientDiseases(patient?.diseases || []);
    setClinicalContent('');
    setAttentionPoints([]);
    setVitalSigns({});
    setNewPoint('');
    setPastNotes([]);

    // Load current or last clinical note
    const { data: noteData } = await supabase.from('clinical_notes').select('*').eq('appointment_id', apt.id).maybeSingle();
    if (noteData) {
      setClinicalContent(noteData.content || '');
      setAttentionPoints(noteData.attention_points || []);
      setVitalSigns(noteData.vital_signs || {});
    }

    fetchPatientMedicines(patient);
    fetchPatientHistory(patient);
  };

  const fetchPatientHistory = async (patient: Patient | null) => {
    if (!patient) return;
    try {
      setHistoryLoading(true);
      const { data, error } = await supabase
        .from('clinical_notes')
        .select('*')
        .eq('patient_id', patient.id)
        .neq('appointment_id', selectedApt?.id || 0)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      setPastNotes(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchPatientMedicines = async (patient: Patient | null) => {
    if (!patient) return;
    try {
      setMedsLoading(true);
      const { data: pData } = await supabase.from('patients').select('remote_id').eq('id', patient.id).single();
      if (!pData?.remote_id) { setMedicines([]); return; }
      const { data } = await supabase
        .from('medications')
        .select('id, stock, medicine_dispensations:dispensation_id ( frequency_label, medicine_catalog:catalog_id ( active_principle, strength, form, dispensing_unit ) )')
        .eq('owner_id', pData.remote_id).not('dispensation_id', 'is', null);
      setMedicines((data || []).map((m: any) => ({
        id: m.id, stock: m.stock,
        active_principle: m.medicine_dispensations?.medicine_catalog?.active_principle || '?',
        strength: m.medicine_dispensations?.medicine_catalog?.strength || '',
        form: m.medicine_dispensations?.medicine_catalog?.form || '',
        dispensing_unit: m.medicine_dispensations?.medicine_catalog?.dispensing_unit || '',
        frequency_label: m.medicine_dispensations?.frequency_label || '',
      })));
    } catch { setMedicines([]); }
    finally { setMedsLoading(false); }
  };

  // Finalizar atendimento
  const handleFinalize = async () => {
    if (!selectedApt) return;
    if (!clinicalContent.trim()) {
      setNotification({ type: 'error', message: 'O relato clínico é obrigatório para finalizar o atendimento.' });
      return;
    }
    const patient = getPatient(selectedApt);
    try {
      setSaving(true);
      const payload = {
        appointment_id: selectedApt.id,
        patient_id: patient?.id || selectedApt.patient_id,
        professional_cns: profile?.cns || '',
        content: clinicalContent.trim(),
        attention_points: attentionPoints,
        vital_signs: vitalSigns,
        updated_at: new Date().toISOString(),
      };
      const { error: noteError } = await supabase.from('clinical_notes').upsert(payload, { onConflict: 'appointment_id' });
      if (noteError) throw noteError;

      const { error } = await supabase.from('appointments').update({ status: 'attended' }).eq('id', selectedApt.id);
      if (error) throw error;

      setSelectedApt(null);
      setNotification({ type: 'success', message: 'Atendimento finalizado com sucesso!' });
      fetchAppointments();
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Erro ao finalizar: ' + err.message });
    } finally { setSaving(false); }
  };

  const handleMarkMissed = async (apt: Appointment) => {
    try {
      await supabase.from('appointments').update({ status: 'missed' }).eq('id', apt.id);
      setNotification({ type: 'success', message: 'Paciente marcado como ausente.' });
      fetchAppointments();
    } catch { setNotification({ type: 'error', message: 'Erro ao atualizar status.' }); }
  };

  const addPoint = () => { if (newPoint.trim()) { setAttentionPoints(prev => [...prev, newPoint.trim()]); setNewPoint(''); } };
  const removePoint = (i: number) => setAttentionPoints(prev => prev.filter((_, idx) => idx !== i));
  const updateVital = (key: keyof VitalSigns, val: string) => setVitalSigns(prev => ({ ...prev, [key]: val ? Number(val) : undefined }));

  const renderShiftSection = (title: string, apts: Appointment[], color: string) => (
    <section className="mb-8">
      <h3 className={`text-sm font-bold uppercase tracking-wider ${color} mb-3 flex items-center gap-2`}>
        <Clock size={16} /> {title} — {apts.length} paciente{apts.length !== 1 ? 's' : ''}
      </h3>
      {apts.length === 0 ? (
        <p className="text-sm text-gray-400 italic pl-6">Nenhum agendamento para este turno.</p>
      ) : (
        <div className="space-y-2">
          {apts.map(apt => {
            const patient = getPatient(apt);
            const hasCheckedIn = !!apt.checked_in_at;
            const statusToShow = apt.status === 'scheduled' && hasCheckedIn ? 'checked_in' : (apt.status || 'scheduled');
            const cfg = getStatusConfig(statusToShow, hasCheckedIn);
            
            const isQueue = statusToShow === 'checked_in';
            const isDone = apt.status === 'attended' || apt.status === 'missed';
            const isAbsent = statusToShow === 'scheduled' && !hasCheckedIn;

            return (
              <div
                key={apt.id}
                onClick={() => isQueue ? openConsultation(apt) : undefined}
                className={`flex items-center justify-between p-4 rounded-xl border ${cfg.borderColor} ${cfg.bgColor} transition ${isDone ? 'opacity-60' : ''} ${isQueue ? 'cursor-pointer hover:shadow-md hover:border-blue-400 ring-offset-2 hover:ring-2 ring-blue-100' : ''}`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isQueue ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                    <User size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{patient?.name || 'Paciente'}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-2">
                      <span>CPF: {patient?.cpf ? formatCPF(patient.cpf) : '—'}</span>
                      {apt.checked_in_at && (
                        <span className="flex items-center gap-1 text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                          <Clock size={10} /> {new Date(apt.checked_in_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-black uppercase tracking-tight px-2 py-0.5 rounded-md ${cfg.bgColor} ${cfg.color} border ${cfg.borderColor}`}>
                      {isAbsent ? 'Não chegou' : cfg.label}
                    </span>
                    {isQueue && <span className="text-[10px] text-blue-500 font-bold animate-pulse">CHAMAR PACIENTE</span>}
                  </div>
                  {isAbsent && (
                    <button onClick={e => { e.stopPropagation(); handleMarkMissed(apt); }} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Marcar como Ausente">
                      <XCircle size={18} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-gray-100 pb-12">
      <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-40 shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/profissional')} className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition"><ArrowLeft size={24} /></button>
          <div>
            <h1 className="text-xl font-black text-gray-800 tracking-tight">FILA DE ATENDIMENTO</h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
        <button onClick={fetchAppointments} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-100">
          <UserCheck size={18} /> ATUALIZAR FILA
        </button>
      </nav>

      <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
        {notification && (
          <div className={`mb-6 rounded-2xl border px-6 py-4 text-sm font-bold shadow-lg flex items-center justify-between animate-in slide-in-from-top-4 duration-300 ${notification.type === 'success' ? 'bg-green-600 border-green-500 text-white' : 'bg-red-600 border-red-500 text-white'}`}>
            <span className="flex items-center gap-2">
              {notification.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
              {notification.message}
            </span>
            <button onClick={() => setNotification(null)} className="ml-3 opacity-80 hover:opacity-100"><X size={20} /></button>
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
            <p className="text-sm font-bold text-gray-400 tracking-widest uppercase">Carregando Fila...</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-32 bg-white rounded-3xl border-2 border-dashed border-gray-200">
            <UserCheck size={64} className="mx-auto mb-6 text-gray-200" />
            <p className="text-xl font-black text-gray-300 uppercase tracking-tighter">Nenhum agendamento para hoje</p>
          </div>
        ) : (
          <>
            {renderShiftSection('Turno da Manhã', morningApts, 'text-blue-600')}
            {renderShiftSection('Turno da Tarde', afternoonApts, 'text-orange-600')}
          </>
        )}
      </main>

      {/* ========== MODAL DE ATENDIMENTO CLÍNICO ========== */}
      {selectedApt && (() => {
        const patient = getPatient(selectedApt);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
              {/* Header Elegante */}
              <div className="bg-gradient-to-br from-gray-900 to-blue-900 px-8 py-8 text-white flex items-center justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <User size={120} />
                </div>
                <div className="relative z-10">
                  <span className="text-[10px] font-black tracking-[0.2em] text-blue-300 uppercase block mb-1">Consulta em Andamento</span>
                  <h2 className="text-3xl font-black tracking-tight">{patient?.name || 'Paciente'}</h2>
                  <div className="flex items-center gap-4 mt-2 text-blue-100/70 text-sm font-bold">
                    <p className="flex items-center gap-1.5"><User size={14} /> CPF: {patient?.cpf ? formatCPF(patient.cpf) : '—'}</p>
                    <p className="flex items-center gap-1.5"><Clock size={14} /> {selectedApt.shift === 'morning' ? 'MANHÃ' : 'TARDE'}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedApt(null)} className="relative z-10 p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all duration-300 group">
                  <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 lg:p-12">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                  
                  {/* Coluna Esquerda: Informações e Sinais */}
                  <div className="lg:col-span-5 space-y-10">
                    
                    {/* Sinais Vitais Quantificáveis */}
                    <div>
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Activity size={16} className="text-blue-500" /> Sinais Vitais (Métricas)
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">PA Sistólica</label>
                          <div className="relative">
                            <input type="number" min="40" max="300" value={vitalSigns.systolic_bp || ''} onChange={e => updateVital('systolic_bp', e.target.value)}
                              className="w-full bg-gray-50 rounded-2xl border-2 border-gray-100 p-4 text-lg font-black focus:border-blue-500 focus:bg-white transition-all outline-none" placeholder="120" />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-300">mmHg</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">PA Diastólica</label>
                          <div className="relative">
                            <input type="number" min="30" max="200" value={vitalSigns.diastolic_bp || ''} onChange={e => updateVital('diastolic_bp', e.target.value)}
                              className="w-full bg-gray-50 rounded-2xl border-2 border-gray-100 p-4 text-lg font-black focus:border-blue-500 focus:bg-white transition-all outline-none" placeholder="80" />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-300">mmHg</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Glicemia</label>
                          <div className="relative">
                            <input type="number" min="20" max="1000" value={vitalSigns.blood_glucose || ''} onChange={e => updateVital('blood_glucose', e.target.value)}
                              className="w-full bg-gray-50 rounded-2xl border-2 border-gray-100 p-4 text-lg font-black focus:border-blue-500 focus:bg-white transition-all outline-none" placeholder="90" />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-300">mg/dL</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Peso</label>
                          <div className="relative">
                            <input type="number" step="0.1" min="0" max="500" value={vitalSigns.weight || ''} onChange={e => updateVital('weight', e.target.value)}
                              className="w-full bg-gray-50 rounded-2xl border-2 border-gray-100 p-4 text-lg font-black focus:border-blue-500 focus:bg-white transition-all outline-none" placeholder="70.5" />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-300">kg</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Condições e Medicamentos */}
                    <div className="bg-gray-50 rounded-[2rem] p-6 space-y-6">
                      <div>
                        <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-amber-500" /> Diagnósticos Ativos</h5>
                        {patientDiseases.length > 0
                          ? <div className="flex flex-wrap gap-2">{patientDiseases.map(d => <span key={d} className="px-3 py-1.5 bg-white shadow-sm text-gray-700 rounded-xl text-xs font-bold border border-gray-100">{d}</span>)}</div>
                          : <p className="text-xs text-gray-400 font-medium italic">Nenhum diagnóstico registrado.</p>}
                      </div>
                      <div>
                        <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Pill size={14} className="text-blue-500" /> Farmacoterapia</h5>
                        {medsLoading ? <div className="animate-pulse flex space-y-2 flex-col"><div className="h-8 bg-gray-200 rounded-lg w-full"></div></div>
                          : medicines.length > 0
                            ? <div className="space-y-2">{medicines.map(m => (
                                <div key={m.id} className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center">
                                  <div><p className="font-bold text-gray-800 text-xs">{m.active_principle}</p><p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{m.strength} • {m.frequency_label}</p></div>
                                </div>))}</div>
                            : <p className="text-xs text-gray-400 font-medium italic">Sem medicamentos ativos.</p>}
                      </div>
                    </div>

                    {/* Histórico Recente */}
                    <div>
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <History size={16} /> Evolução Clínica Anterior
                      </h4>
                      {historyLoading ? <div className="h-20 bg-gray-50 rounded-2xl animate-pulse"></div>
                      : pastNotes.length > 0 ? (
                        <div className="space-y-3">
                          {pastNotes.map(note => (
                            <div key={note.id} className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm text-xs">
                              <p className="font-black text-gray-400 uppercase text-[9px] mb-1">{new Date(note.created_at).toLocaleDateString('pt-BR')}</p>
                              <p className="text-gray-600 line-clamp-2 italic font-medium">"{note.content}"</p>
                              {note.vital_signs?.systolic_bp && (
                                <div className="mt-2 flex gap-2 text-[10px] font-bold text-blue-600 bg-blue-50 w-fit px-2 py-0.5 rounded-lg">
                                  PA: {note.vital_signs.systolic_bp}/{note.vital_signs.diastolic_bp}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-gray-400 italic">Sem registros anteriores.</p>}
                    </div>
                  </div>

                  {/* Coluna Direita: Notas e Pontos */}
                  <div className="lg:col-span-7 space-y-10">
                    
                    {/* Relato Clínico Principal */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={16} className="text-green-500" /> Relato Clínico e Conduta
                      </h4>
                      <textarea value={clinicalContent} onChange={e => setClinicalContent(e.target.value)}
                        className="w-full rounded-[2rem] border-2 border-gray-100 bg-gray-50 p-8 text-lg font-medium focus:border-green-500 focus:bg-white transition-all outline-none min-h-[300px] shadow-inner"
                        placeholder="Descreva aqui a evolução do paciente, queixas atuais e conduta médica..." />
                    </div>

                    {/* Pontos de Atenção (Alertas) */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-500" /> Pontos de Atenção Próxima
                      </h4>
                      <div className="flex gap-3">
                        <input value={newPoint} onChange={e => setNewPoint(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPoint())}
                          className="flex-1 rounded-2xl border-2 border-gray-100 bg-gray-50 px-6 py-4 font-bold focus:border-amber-500 transition-all outline-none shadow-sm"
                          placeholder="Ex: Monitorar febre persistente..." />
                        <button onClick={addPoint} className="bg-amber-500 text-white w-14 h-14 rounded-2xl flex items-center justify-center hover:bg-amber-600 transition-all shadow-lg shadow-amber-100">
                          <Plus size={24} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {attentionPoints.map((p, i) => (
                          <div key={i} className="flex items-center gap-3 bg-amber-50 border-2 border-amber-100 text-amber-800 px-5 py-3 rounded-2xl font-bold animate-in zoom-in-50 duration-300">
                            <span>{p}</span>
                            <button onClick={() => removePoint(i)} className="text-amber-300 hover:text-amber-600 transition-colors"><X size={18} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer de Ação Massiva */}
              <div className="p-6 lg:p-8 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest hidden lg:block">Registro seguro no prontuário eletrônico</p>
                <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
                   <button onClick={() => setSelectedApt(null)} className="px-8 py-3 rounded-2xl font-black text-gray-400 hover:text-gray-600 transition-all text-sm">CANCELAR</button>
                   <button onClick={handleFinalize} disabled={saving} 
                    className="flex items-center justify-center gap-2 bg-green-600 text-white px-8 py-4 rounded-2xl font-black text-sm lg:text-base hover:bg-green-700 transition-all shadow-xl shadow-green-200 disabled:opacity-50 active:scale-95 whitespace-nowrap min-w-[240px]">
                    {saving ? 'SALVANDO...' : (
                      <>
                        <CheckCircle size={20} /> FINALIZAR ATENDIMENTO
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
