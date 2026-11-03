import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { configError } from './lib/supabase';
import { Layout } from './components/Layout';
import { ErrorBox } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { ObjectsPage } from './pages/ObjectsPage';
import { ObjectPage } from './pages/ObjectPage';
import { TaskPage } from './pages/TaskPage';
import { MyTasksPage } from './pages/MyTasksPage';
import { NotFoundPage } from './pages/NotFoundPage';

function HomeRedirect() {
  const { profile } = useAuth();
  return <Navigate to={profile?.role === 'worker' ? '/my' : '/objects'} replace />;
}

export default function App() {
  if (configError) {
    return (
      <div className="page-center">
        <ErrorBox message={configError} />
      </div>
    );
  }

  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route index element={<HomeRedirect />} />
            <Route path="objects" element={<ObjectsPage />} />
            <Route path="objects/:objectId" element={<ObjectPage />} />
            <Route path="tasks/:taskId" element={<TaskPage />} />
            <Route path="my" element={<MyTasksPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
