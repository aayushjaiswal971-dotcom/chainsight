import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Shipments from './pages/Shipments';
import RiskAnalysis from './pages/RiskAnalysis';
import ImportCenter from './pages/ImportCenter';

function ThemedToaster() {
  const { isDark } = useTheme();
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: isDark ? 'var(--bg-raised)' : 'var(--bg-surface)',
          color: 'var(--text-main)',
          border: '1px solid var(--border-color)',
          fontSize: '12px',
          fontFamily: "'IBM Plex Sans', sans-serif",
          borderRadius: '4px',
          boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.06)',
          padding: '8px 12px',
        },
        success: {
          iconTheme: {
            primary: 'var(--status-green-dot)',
            secondary: isDark ? 'var(--bg-raised)' : 'var(--bg-surface)',
          },
        },
        error: {
          iconTheme: {
            primary: 'var(--status-red-dot)',
            secondary: isDark ? 'var(--bg-raised)' : 'var(--bg-surface)',
          },
        },
      }}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ThemedToaster />
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Protected Operational Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/shipments" element={<Shipments />} />
                <Route path="/risk-analysis" element={<RiskAnalysis />} />
                <Route path="/import" element={<ImportCenter />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
