import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, UserCheck, CheckCircle, XCircle, Clock, AlertTriangle, Pill, X, Activity, History, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { STATUS_CONFIG } from '../../lib/database.types';
import type { VitalSigns, ClinicalNote } from '../../lib/database.types';
import { useNotification } from '../../contexts/NotificationContext';

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
  const { showNotification } = useNotification();

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
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  useEffect(() => { if (profile?.cns) fetchAppointments(); }, [profile]);

  // Lógica de Salvamento Automático (Debounce)
  useEffect(() => {
    if (!selectedApt || !clinicalContent.trim()) return;

    const timer = setTimeout(async () => {
      const patient = getPatient(selectedApt);
      try {
        setIsAutoSaving(true);
        const payload = {
          appointment_id: selectedApt.id,
          patient_id: patient?.id || selectedApt.patient_id,
          professional_cns: profile?.cns || '',
          content: clinicalContent.trim(),
          attention_points: attentionPoints,
          vital_signs: vitalSigns,
          updated_at: new Date().toISOString(),
        };
        await supabase.from('clinical_notes').upsert(payload, { onConflict: 'appointment_id' });
      } catch (err) {
        console.error('Erro no salvamento automático:', err);
      } finally {
        // Delay extra para o usuário ver o estado de "Salvando"
        setTimeout(() => setIsAutoSaving(false), 800);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [clinicalContent, vitalSigns, attentionPoints, selectedApt]);

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
      showNotification('error', 'Erro ao carregar atendimentos.');
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
    fetchPatientHistory(patient, apt.id);
  };

  const fetchPatientHistory = async (patient: Patient | null, currentAptId?: string) => {
    if (!patient) return;
    try {
      setHistoryLoading(true);
      const { data, error } = await supabase
        .from('clinical_notes')
        .select('*')
        .eq('patient_id', patient.id)
        .neq('appointment_id', currentAptId || '0')
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
      showNotification('error', 'O relato clínico é obrigatório para finalizar o atendimento.');
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
      showNotification('success', 'Atendimento finalizado com sucesso!');
      fetchAppointments();
    } catch (err: any) {
      showNotification('error', 'Erro ao finalizar: ' + err.message);
    } finally { setSaving(false); }
  };

  const handleMarkMissed = async (apt: Appointment) => {
    try {
      await supabase.from('appointments').update({ status: 'missed' }).eq('id', apt.id);
      showNotification('success', 'Paciente marcado como ausente.');
      fetchAppointments();
    } catch { showNotification('error', 'Erro ao atualizar status.'); }
  };

  const addPoint = () => { if (newPoint.trim()) { setAttentionPoints(prev => [...prev, newPoint.trim()]); setNewPoint(''); } };
  const removePoint = (i: number) => setAttentionPoints(prev => prev.filter((_, idx) => idx !== i));
  const updateVital = (key: keyof VitalSigns, val: string) => {
    if (!val) {
      setVitalSigns(prev => ({ ...prev, [key]: undefined }));
      return;
    }

    // Limites de segurança para cada campo
    const limits: Record<string, number> = {
      systolic_bp: 300,
      diastolic_bp: 250,
      blood_glucose: 1200,
      weight: 600
    };

    let num = Number(val);
    const max = limits[key];

    if (max && num > max) num = max;

    setVitalSigns(prev => ({ ...prev, [key]: num }));
  };

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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-400">

              {/* Header Clean e Profissional */}
              <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-100">
                    <Activity size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900">{patient?.name || 'Paciente'}</h2>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md uppercase tracking-wider">
                        Em Atendimento
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-gray-600 text-sm font-medium">
                      <p className="flex items-center gap-1"><User size={16} className="text-gray-500" /> CPF: {patient?.cpf ? formatCPF(patient.cpf) : '—'}</p>
                      <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                      <p className="flex items-center gap-1"><Clock size={16} className="text-gray-500" /> Turno: {selectedApt.shift === 'morning' ? 'MANHÃ' : 'TARDE'}</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedApt(null)}
                  className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all group"
                >
                  <X size={24} className="transition-transform duration-300 group-hover:rotate-90" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

                  {/* Coluna Lateral: Dados e Histórico */}
                  <div className="lg:col-span-4 bg-gray-50/30">
                    <div className="p-8 lg:p-10 space-y-10">

                      {/* Sinais Vitais */}
                      <section>
                        <h4 className="text-[16px] font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <Activity size={24} className="text-blue-500" /> Sinais Vitais
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'PA Sistólica', key: 'systolic_bp', unit: 'mmHg', placeholder: '120', min: 40, max: 300 },
                            { label: 'PA Diastólica', key: 'diastolic_bp', unit: 'mmHg', placeholder: '80', min: 30, max: 200 },
                            { label: 'Glicemia', key: 'blood_glucose', unit: 'mg/dL', placeholder: '90', min: 20, max: 1000 },
                            { label: 'Peso (kg)', key: 'weight', unit: 'kg', placeholder: '70.5', min: 0, max: 500, step: 0.1 },
                          ].map((field) => (
                            <div key={field.key} className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                              <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">{field.label}</label>
                              <div className="flex items-baseline gap-1">
                                <input
                                  type="number"
                                  min={field.min}
                                  max={field.max}
                                  step={field.step || 1}
                                  value={vitalSigns[field.key as keyof VitalSigns] || ''}
                                  onChange={e => updateVital(field.key as keyof VitalSigns, e.target.value)}
                                  className="w-full bg-transparent text-lg font-bold text-gray-800 outline-none placeholder:text-gray-300"
                                  placeholder={field.placeholder}
                                />
                                <span className="text-[9px] font-bold text-gray-400">{field.unit}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Diagnósticos e Medicamentos */}
                      <section className="space-y-6">
                        <div>
                          <h5 className="text-[16px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                            <AlertTriangle size={24} className="text-amber-500" /> Diagnósticos Ativos
                          </h5>
                          {patientDiseases.length > 0
                            ? <div className="flex flex-wrap gap-1.5">
                              {patientDiseases.map(d => (
                                <span key={d} className="px-2.5 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg text-[11px] font-semibold shadow-sm">
                                  {d}
                                </span>
                              ))}
                            </div>
                            : <p className="text-[11px] text-gray-400 font-medium italic">Nenhum diagnóstico registrado.</p>}
                        </div>

                        <div>
                          <h5 className="text-[16px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                            <Pill size={24} className="text-blue-500" /> Medicamentos Ativos
                          </h5>
                          {medsLoading ? (
                            <div className="space-y-2">
                              <div className="h-10 bg-gray-100 rounded-xl animate-pulse w-full"></div>
                              <div className="h-10 bg-gray-100 rounded-xl animate-pulse w-3/4"></div>
                            </div>
                          ) : medicines.length > 0 ? (
                            <div className="space-y-2">
                              {medicines.map(m => (
                                <div key={m.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                  <p className="font-bold text-gray-800 text-[11px] leading-tight">{m.active_principle}</p>
                                  <p className="text-[9px] text-gray-600 font-medium mt-0.5">{m.strength} • {m.frequency_label}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-gray-400 font-medium italic">Sem medicamentos ativos.</p>
                          )}
                        </div>
                      </section>

                      {/* Histórico Anterior */}
                      <section>
                        <h4 className="text-[16px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                          <History size={24} className="text-gray-500" /> Evolução Recente
                        </h4>
                        {historyLoading ? (
                          <div className="h-24 bg-gray-100 rounded-2xl animate-pulse"></div>
                        ) : pastNotes.length > 0 ? (
                          <div className="space-y-3">
                            {pastNotes.map(note => (
                              <div key={note.id} className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                                <p className="font-bold text-gray-500 uppercase text-[9px] mb-1.5">
                                  {new Date(note.created_at).toLocaleDateString('pt-BR')}
                                </p>
                                <p className="text-gray-600 text-xs leading-relaxed line-clamp-3 font-medium">
                                  {note.content}
                                </p>
                                {note.vital_signs?.systolic_bp && (
                                  <div className="mt-2.5 flex gap-2 text-[10px] font-bold text-blue-600">
                                    PA: {note.vital_signs.systolic_bp}/{note.vital_signs.diastolic_bp} mmHg
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic">Sem registros anteriores.</p>
                        )}
                      </section>
                    </div>
                  </div>

                  {/* Coluna Principal: Evolução e Conduta */}
                  <div className="lg:col-span-8 bg-white">
                    <div className="p-8 lg:p-10 space-y-10">

                      {/* Área de Texto Principal */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[16px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                            <Activity size={24} className="text-green-500" /> Relato Clínico e Conduta
                          </h4>
                          <span className="text-[12px] text-gray-400 font-bold uppercase">Registro Obrigatório</span>
                        </div>
                        <textarea
                          value={clinicalContent}
                          onChange={e => setClinicalContent(e.target.value)}
                          className="w-full rounded-2xl border-2 border-gray-50 bg-gray-50/50 p-6 text-base font-medium text-gray-800 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-50 transition-all outline-none min-h-[350px] leading-relaxed resize-none placeholder:text-gray-400"
                          placeholder="Descreva aqui a evolução do paciente, queixas atuais e conduta médica..."
                        />
                      </div>

                      {/* Pontos de Atenção */}
                      <div className="space-y-4">
                        <h4 className="text-[16px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                          <AlertTriangle size={24} className="text-amber-500" /> Pontos de Atenção para Próxima Consulta
                        </h4>
                        <div className="flex gap-2">
                          <input
                            value={newPoint}
                            onChange={e => setNewPoint(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPoint())}
                            className="flex-1 rounded-xl border-2 border-gray-50 bg-gray-50/50 px-5 py-3.5 text-sm font-semibold text-gray-700 focus:border-amber-500 focus:bg-white transition-all outline-none placeholder:text-gray-400"
                            placeholder="Ex: Monitorar febre persistente..."
                          />
                          <button
                            onClick={addPoint}
                            className="bg-amber-500 text-white px-5 rounded-xl flex items-center justify-center hover:bg-amber-600 transition-all shadow-lg shadow-amber-100 font-bold text-sm"
                          >
                            ADICIONAR
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {attentionPoints.map((p, i) => (
                            <div key={i} className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg text-xs font-bold animate-in zoom-in-95 duration-200">
                              <span>{p}</span>
                              <button onClick={() => removePoint(i)} className="text-amber-300 hover:text-amber-600 transition-colors group">
                                <X size={14} className="transition-transform duration-300 group-hover:rotate-45" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer de Ação */}
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-[12px] text-gray-500 font-bold uppercase tracking-wider">
                  <div className={`w-1.5 h-1.5 rounded-full ${isAutoSaving ? 'bg-amber-500 animate-bounce' : 'bg-green-500'}`}></div>
                  {isAutoSaving ? 'Salvando alterações...' : 'Alterações salvas'}
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => setSelectedApt(null)}
                    className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:text-gray-700 transition-all text-xs uppercase tracking-widest"
                  >
                    Sair sem salvar
                  </button>
                  <button
                    onClick={handleFinalize}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 bg-green-600 text-white px-10 py-3.5 rounded-xl font-bold text-sm hover:bg-green-700 transition-all shadow-xl shadow-green-100 disabled:opacity-50 active:scale-95 whitespace-nowrap"
                  >
                    {saving ? 'PROCESSANDO...' : (
                      <>
                        <CheckCircle size={18} /> FINALIZAR ATENDIMENTO
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
