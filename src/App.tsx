import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import LibraryPage from '@/pages/LibraryPage';
import RewritePage from '@/pages/RewritePage';
import PersonalisePage from '@/pages/PersonalisePage';
import LoginPage from '@/pages/LoginPage';
import Navbar from '@/components/Navbar';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { apiKey } = useAuth();
  if (!apiKey) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <LibraryPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rewrite"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <RewritePage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/personalise"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <PersonalisePage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}
