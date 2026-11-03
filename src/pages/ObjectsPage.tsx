import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createObject, fetchObjects } from '../lib/api';
import { useProfile } from '../lib/auth';
import { useLoader } from '../lib/useLoader';
import { ObjectForm } from '../components/ObjectForm';
import { Card, Empty, ErrorBox, Spinner } from '../components/ui';

export function ObjectsPage() {
  const profile = useProfile();
  const isManager = profile.role === 'manager';
  const { data: objects, error, loading, reload } = useLoader(fetchObjects, []);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <h1>Объекты</h1>
        {isManager && !creating && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            Новый объект
          </button>
        )}
      </div>

      {creating && (
        <Card>
          <h2>Новый объект</h2>
          <ObjectForm
            submitLabel="Создать"
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              await createObject(values);
              setCreating(false);
              await reload();
            }}
          />
        </Card>
      )}

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !objects && <Spinner />}

      {objects && objects.length === 0 && (
        <Empty>{isManager ? 'Объектов пока нет.' : 'Вам пока не назначено задач ни на одном объекте.'}</Empty>
      )}

      {objects && objects.length > 0 && (
        <ul className="list">
          {objects.map((o) => (
            <li key={o.id}>
              <Link to={`/objects/${o.id}`} className="list-item">
                <div>
                  <div className="list-title">{o.name}</div>
                  <div className="muted">{o.address}</div>
                </div>
                <div className="counter" title="Открытые задачи из всех задач объекта">
                  открыто {o.openCount} из {o.taskCount}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
