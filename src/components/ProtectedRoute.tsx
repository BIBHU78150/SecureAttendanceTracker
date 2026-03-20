import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const ProtectedRoute = ({ adminOnly = false }: { adminOnly?: boolean }) => {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-slate-50"></div>;
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && profile.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};
