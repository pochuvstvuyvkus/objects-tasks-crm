import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { fetchMyTasks } from '../lib/api';
import { useProfile } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { STATUS_LABEL, STATUS_ORDER } from '../lib/status';
import { useLoader } from '../lib/useLoader';
import { Empty, ErrorBox, Spinner, StatusBadge } from '../components/ui';
import type { TaskStatus } from '../lib/database.types';

type Filter = 'active' | 'all' | TaskStatus;

export function MyTasksPage() {
  const profile = useProfile();
  const { data, error, loading, reload } = useLoader(() => fetchMyTasks(profile.id), [profile.id]);
  const [filter, setFilter] = useState<Filter>('active');

  const visible = useMemo(() => {
    const list = data ?? [];
    const filtered =
      filter === 'all'
        ? list
        : filter === 'active'
          ? list.filter((t) => t.status !== 'accepted')
          : list.filter((t) => t.status === filter);
    return [...filtered].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  }, [data, filter]);

  if (profile.role !== 'worker') return <Navigate to="/objects" replace />;

  const count = (s: TaskStatus) => (data ?? []).filter((t) => t.status === s).length;
  const filters: { key: Filter; label: string }[] = [
    { key: 'active', label: 'Активные' },
    ...STATUS_ORDER.map((s) => ({ key: s as Filter, label: `${STATUS_LABEL[s]} (${count(s)})` })),
    { key: 'all', label: 'Все' },
  ];

  return (
    <>
      <div className="page-head">
        <h1>Мои задачи</h1>
      </div>

      <div className="chips">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip ${filter === f.key ? 'chip-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && visible.length === 0 && <Empty>Задач нет.</Empty>}
      {visible.length > 0 && (
        <ul className="list">
          {visible.map((t) => (
            <li key={t.id}>
              <Link to={`/tasks/${t.id}`} className="list-item">
                <div>
                  <div className="list-title">{t.title}</div>
                  <div className="muted">
                    {t.object?.name ?? 'Объект'} · обновлена {formatDateTime(t.updated_at)}
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
