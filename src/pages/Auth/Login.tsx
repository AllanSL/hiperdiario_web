import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { LogIn, Loader2 } from 'lucide-react';
import { formatCpf } from '../../lib/utils';

export default function Login() {
    const [cpf, setCpf] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { showNotification } = useNotification();

    const { session, profile } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (session && profile) {
            if (profile.role === 'recepcionista') navigate('/recepcionista');
            else if (profile.role === 'farmacia') navigate('/farmacia');
            else if (profile.role === 'profissional_saude') navigate('/profissional');
        }
    }, [session, profile, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length < 11) {
            showNotification('warning', 'Digite o CPF completo (11 dígitos) para entrar.');
            return;
        }

        setLoading(true);

        const emailFormat = `${cleanCpf}@hiperdiario.web`;

        const { error } = await supabase.auth.signInWithPassword({
            email: emailFormat,
            password: password,
        });

        if (error) {
            if (error.message === 'Invalid login credentials') {
                showNotification('error', 'CPF ou senha incorretos. Verifique seus dados.');
            } else {
                showNotification('error', error.message);
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-md cursor-default">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Acesso Profissionais
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        HiperDiário - Sistema Administrativo
                    </p>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <input
                                id="cpf"
                                name="cpf"
                                type="text"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                                placeholder="000.000.000-00"
                                value={cpf}
                                onChange={(e) => setCpf(formatCpf(e.target.value))}
                                maxLength={14}
                            />
                        </div>
                        <div>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                                placeholder="Senha"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                <LogIn className="h-5 w-5 text-green-500 group-hover:text-green-400" aria-hidden="true" />
                            </span>
                            {loading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>Entrando...</span>
                                </div>
                            ) : 'Entrar'}
                        </button>
                    </div>

                    <div className="text-center text-sm pt-4">
                        <Link to="/cadastro" className="font-medium text-green-600 hover:text-green-500">
                            É profissional e não tem acesso? Cadastre-se
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
