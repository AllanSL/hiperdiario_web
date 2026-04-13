import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import RecepcionistaDashboard from './pages/RecepcionistaDashboard';
import FarmaciaDashboard from './pages/FarmaciaDashboard';
import ProfissionalDashboard from './pages/ProfissionalDashboard';
import Register from './pages/Register';

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
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<Login />} />
          <Route path='/cadastro' element={<Register />} />
          <Route path='/recepcionista' element={<ProtectedRoute allowedRoles={['recepcionista']}><RecepcionistaDashboard /></ProtectedRoute>} />
          <Route path='/farmacia' element={<ProtectedRoute allowedRoles={['farmacia']}><FarmaciaDashboard /></ProtectedRoute>} />
          <Route path='/profissional' element={<ProtectedRoute allowedRoles={['profissional_saude']}><ProfissionalDashboard /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
