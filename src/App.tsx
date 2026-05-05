import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Auth/Login';
import RecepcionistaDashboard from './pages/Recepcionista/RecepcionistaDashboard';
import RecepcionistaPacientes from './pages/Recepcionista/RecepcionistaPacientes';
import RecepcionistaAgenda from './pages/Recepcionista/RecepcionistaAgenda';
import RecepcionistaResumoUBS from './pages/Recepcionista/RecepcionistaResumoUBS';
import FarmaciaDashboard from './pages/Farmacia/FarmaciaDashboard';
import ProfissionalDashboard from './pages/Profissional/ProfissionalDashboard';
import ProfissionalAgenda from './pages/Profissional/ProfissionalAgenda';
import ProfissionalAtendimentos from './pages/Profissional/ProfissionalAtendimentos';
import ProfissionalPacientes from './pages/Profissional/ProfissionalPacientes';
import Register from './pages/Auth/Register';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <div className='min-h-screen flex items-center justify-center'>Carregando...</div>;
  if (!session) return <Navigate to='/' replace />;
  if (profile && !allowedRoles.includes(profile.role)) {
    return <div className='min-h-screen flex items-center justify-center'>Acesso Negado. Voc� n�o tem permiss�o para acessar esta p�gina.</div>;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path='/' element={<Login />} />
          <Route path='/cadastro' element={<Register />} />
          <Route path='/recepcionista' element={<ProtectedRoute allowedRoles={['recepcionista']}><RecepcionistaDashboard /></ProtectedRoute>} />
          <Route path='/recepcionista/pacientes' element={<ProtectedRoute allowedRoles={['recepcionista']}><RecepcionistaPacientes /></ProtectedRoute>} />
          <Route path='/recepcionista/agenda' element={<ProtectedRoute allowedRoles={['recepcionista']}><RecepcionistaAgenda /></ProtectedRoute>} />
          <Route path='/recepcionista/resumo' element={<ProtectedRoute allowedRoles={['recepcionista']}><RecepcionistaResumoUBS /></ProtectedRoute>} />
          <Route path='/farmacia' element={<ProtectedRoute allowedRoles={['farmacia']}><FarmaciaDashboard /></ProtectedRoute>} />
          <Route path='/profissional' element={<ProtectedRoute allowedRoles={['profissional_saude']}><ProfissionalDashboard /></ProtectedRoute>} />
          <Route path='/profissional/agenda' element={<ProtectedRoute allowedRoles={['profissional_saude']}><ProfissionalAgenda /></ProtectedRoute>} />
          <Route path='/profissional/atendimentos' element={<ProtectedRoute allowedRoles={['profissional_saude']}><ProfissionalAtendimentos /></ProtectedRoute>} />
          <Route path='/profissional/pacientes' element={<ProtectedRoute allowedRoles={['profissional_saude']}><ProfissionalPacientes /></ProtectedRoute>} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
