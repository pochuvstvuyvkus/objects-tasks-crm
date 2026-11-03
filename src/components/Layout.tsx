import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/status';
import { personName } from '../lib/format';
import { ErrorBox, Spinner } from './ui';

export function Layout() {
  const { session, profile, loading, error, signOut } = useAuth();
  const location = useLocation();

  if (!session && !loading) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (error) {
    return (
      <div className="page-center">
        <ErrorBox message={error} />
        <button type="button" className="btn" onClick={() => void signOut()}>
          Выйти
        </button>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className="page-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/objects" className="brand">
            Объекты и задачи
          </NavLink>
          <nav className="nav">
            <NavLink to="/objects">Объекты</NavLink>
            {profile.role === 'worker' && <NavLink to="/my">Мои задачи</NavLink>}
          </nav>
          <div className="user">
            <span className="user-name">{personName(profile)}</span>
            <span className={`role role-${profile.role}`}>{ROLE_LABEL[profile.role]}</span>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void signOut()}>
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
