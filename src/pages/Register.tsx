import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { CnesEstabelecimento, CnesProfissional } from '../lib/cnesService';
import { CnesService } from '../lib/cnesService';
import { UserPlus, Search } from 'lucide-react';
import ufsData from '../lib/municipios.json';
import { CustomSelect } from '../components/CustomSelect';

export default function Register() {
    const [cpf, setCpf] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // CNES Selection State
    const [uf, setUf] = useState<number>(0); // IBGE UF code
    const [municipio, setMunicipio] = useState<number>(0); // IBGE code 7 digits
    const [estabelecimentos, setEstabelecimentos] = useState<CnesEstabelecimento[]>([]);
    const [selectedEstabelecimento, setSelectedEstabelecimento] = useState<CnesEstabelecimento | null>(null);

    const cidadesList = useMemo(() => {
        if (!uf) return [];
        const estadoInfo = ufsData.find((e: any) => e.id_uf === uf);
        return estadoInfo ? estadoInfo.municipios : [];
    }, [uf]);

    const [profissionais, setProfissionais] = useState<CnesProfissional[]>([]);
    const [selectedProfissional, setSelectedProfissional] = useState<CnesProfissional | null>(null);
    const [crmCrf, setCrmCrf] = useState('');

    const navigate = useNavigate();

    const handleBuscarEstabelecimentos = async () => {
        if (!uf || !municipio) return;
        setLoading(true);
        try {
            const data = await CnesService.buscarEstabelecimentos(uf, municipio);
            setEstabelecimentos(data);
        } catch (e) {
            setError('Erro ao buscar UBS');
        }
        setLoading(false);
    };

    const handleSelectEstabelecimento = async (est: CnesEstabelecimento) => {
        setSelectedEstabelecimento(est);
        setSelectedProfissional(null);
        setLoading(true);

        // Simulate IBGE parsing for professionals search limit (needs ibge and cnes)
        const ibge7Digitos = municipio;
        const data = await CnesService.buscarProfissionais(ibge7Digitos, est.codigoCnes);
        setProfissionais(data);
        setLoading(false);
    };

    const mapEspecialidadeToRole = (especialidade: string): 'recepcionista' | 'farmacia' | 'profissional_saude' => {
        const esp = especialidade.toUpperCase();
        if (esp.includes('RECEPCIONISTA')) return 'recepcionista';
        if (esp.includes('FARMACEUTICO') || esp.includes('FARMACÊUTICO')) return 'farmacia';
        return 'profissional_saude';
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProfissional || !selectedEstabelecimento) {
            setError('Selecione seu perfil na lista de profissionais do estabelecimento.');
            return;
        }

        setLoading(true);
        setError('');

        const emailFormat = `${cpf.replace(/\D/g, '')}@hiperdiario.com`;
        const role = mapEspecialidadeToRole(selectedProfissional.especialidade);

        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: emailFormat,
                password: password,
            });

            if (authError) throw authError;

            if (authData.user) {
                const { error: insertError } = await supabase
                    .from('profissionais')
                    .insert({
                        id: authData.user.id,
                        nome: selectedProfissional.nome,
                        cpf: cpf.replace(/\D/g, ''),
                        role: role,
                        crm_crf: crmCrf,
                        ibge: municipio.toString(),
                        cnes: selectedEstabelecimento.codigoCnes.toString(),
                    });

                if (insertError) throw insertError;

                // Signed up and created profile!
                navigate('/');
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao registrar profissional.');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl w-full space-y-8 bg-white p-8 rounded-xl shadow-md">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Cadastro de Profissional
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Encontre-se no CNES para criar seu acesso
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleRegister}>
                    {error && <div className="text-red-500 text-sm text-center">{error}</div>}

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="min-w-0">
                                <label className="block text-sm font-medium text-gray-700 truncate">Estado (UF)</label>
                                <CustomSelect
                                    value={uf || ''}
                                    onChange={(val) => {
                                        setUf(Number(val));
                                        setMunicipio(0);
                                        setEstabelecimentos([]);
                                        setProfissionais([]);
                                        setSelectedEstabelecimento(null);
                                        setSelectedProfissional(null);
                                    }}
                                    placeholder="-- Selecione --"
                                    options={ufsData.map((estado: any) => ({
                                        value: estado.id_uf,
                                        label: `${estado.sigla} - ${estado.nome}`
                                    }))}
                                />
                            </div>
                            <div className="min-w-0">
                                <label className="block text-sm font-medium text-gray-700 truncate">Município</label>
                                <CustomSelect
                                    value={municipio || ''}
                                    disabled={!uf}
                                    onChange={(val) => {
                                        setMunicipio(Number(val));
                                        setEstabelecimentos([]);
                                        setProfissionais([]);
                                        setSelectedEstabelecimento(null);
                                        setSelectedProfissional(null);
                                    }}
                                    placeholder="-- Selecione --"
                                    options={cidadesList.map((cidade: any) => ({
                                        value: cidade.id_municipio,
                                        label: cidade.nome
                                    }))}
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleBuscarEstabelecimentos}
                            className="w-full flex justify-center py-2 border border-gray-300 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            <Search className="w-5 h-5 mr-2" /> Buscar Unidades (UBS)
                        </button>

                        {estabelecimentos.length > 0 && (
                            <div className="w-full min-w-0">
                                <label className="block text-sm font-medium text-gray-700 truncate">Selecione o Estabelecimento</label>
                                <CustomSelect
                                    value={selectedEstabelecimento?.codigoCnes || ''}
                                    onChange={(val) => {
                                        const est = estabelecimentos.find(est => est.codigoCnes.toString() === val.toString());
                                        if (est) handleSelectEstabelecimento(est);
                                    }}
                                    placeholder="-- Escolha --"
                                    options={estabelecimentos.map(est => ({
                                        value: est.codigoCnes,
                                        label: est.nomeFantasia
                                    }))}
                                />
                            </div>
                        )}

                        {profissionais.length > 0 && (
                            <div className="w-full min-w-0">
                                <label className="block text-sm font-medium text-gray-700 truncate">Selecione o seu Perfil</label>
                                <CustomSelect
                                    value={selectedProfissional ? `${selectedProfissional.especialidade} - ${selectedProfissional.nome}` : ''}
                                    onChange={(val) => {
                                        const prof = profissionais.find(p => `${p.especialidade} - ${p.nome}` === val);
                                        if (prof) setSelectedProfissional(prof);
                                    }}
                                    placeholder="-- Escolha --"
                                    options={profissionais.map(prof => ({
                                        value: `${prof.especialidade} - ${prof.nome}`,
                                        label: `${prof.especialidade} - ${prof.nome}`
                                    }))}
                                />
                            </div>
                        )}

                        {selectedProfissional && (
                            <div className="pt-4 border-t">
                                <h3 className="text-md font-semibold text-gray-800 mb-4">Dados de Acesso</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">CPF</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Somente números"
                                            value={cpf}
                                            onChange={(e) => setCpf(e.target.value)}
                                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Senha</label>
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                        />
                                    </div>
                                    {(mapEspecialidadeToRole(selectedProfissional.especialidade) === 'profissional_saude' ||
                                        mapEspecialidadeToRole(selectedProfissional.especialidade) === 'farmacia') && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">CRM / CRF (Opcional)</label>
                                                <input
                                                    type="text"
                                                    value={crmCrf}
                                                    onChange={(e) => setCrmCrf(e.target.value)}
                                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                                />
                                            </div>
                                        )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading || !selectedProfissional}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            <UserPlus className="w-5 h-5 mr-2" />
                            {loading ? 'Cadastrando...' : 'Finalizar Cadastro'}
                        </button>
                    </div>

                    <div className="text-center text-sm">
                        <Link to="/" className="font-medium text-green-600 hover:text-green-500">
                            Já tem acesso? Faça login
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}