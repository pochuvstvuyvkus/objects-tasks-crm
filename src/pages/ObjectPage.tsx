import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createTask,
  deleteObject,
  fetchObject,
  fetchObjectTasks,
  fetchWorkers,
  updateObject,
} from '../lib/api';
import { useProfile } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import { formatDate, personName } from '../lib/format';
import { useLoader } from '../lib/useLoader';
import { ObjectForm } from '../components/ObjectForm';
import { TaskForm } from '../components/TaskForm';
import { Card, Empty, ErrorBox, Spinner, StatusBadge } from '../components/ui';

export function ObjectPage() {
  const { objectId = '' } = useParams();
  const navigate = useNavigate();
  const profile = useProfile();
  const isManager = profile.role === 'manager';

  const object = useLoader(() => fetchObject(objectId), [objectId]);
  const tasks = useLoader(() => fetchObjectTasks(objectId), [objectId]);
  const workers = useLoader(async () => (isManager ? fetchWorkers() : []), [isManager]);

  const [editing, setEditing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (object.loading && !object.data) return <Spinner />;
  if (object.error) return <ErrorBox message={object.error} onRetry={object.reload} />;
  if (!object.data) {
    return (
      <Empty>
        Объект не найден или у вас нет к нему доступа. <Link to="/objects">К объектам</Link>
      </Empty>
    );
  }

  const obj = object.data;

  const onDelete = async () => {
    if (!window.confirm(`Удалить объект «${obj.name}»?`)) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteObject(obj.id);
      navigate('/objects', { replace: true });
    } catch (e) {
      setActionError(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <>
      <Link to="/objects" className="back">
        ← Объекты
      </Link>

      <Card>
        {editing ? (
          <>
            <h2>Редактирование объекта</h2>
            <ObjectForm
              initial={{ name: obj.name, address: obj.address }}
              submitLabel="Сохранить"
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                await updateObject(obj.id, values);
                setEditing(false);
                await object.reload();
              }}
            />
          </>
        ) : (
          <div className="page-head">
            <div>
              <h1>{obj.name}</h1>
              <div className="muted">{obj.address}</div>
            </div>
            {isManager && (
              <div className="actions">
                <button type="button" className="btn" onClick={() => setEditing(true)}>
                  Изменить
                </button>
                <button type="button" className="btn btn-danger" onClick={onDelete} disabled={deleting}>
                  {deleting ? 'Удаляем…' : 'Удалить'}
                </button>
              </div>
            )}
          </div>
        )}
        {actionError && <ErrorBox message={actionError} />}
      </Card>

      <div className="page-head">
        <h2>Задачи</h2>
        {isManager && !creatingTask && (
          <button type="button" className="btn btn-primary" onClick={() => setCreatingTask(true)}>
            Новая задача
          </button>
        )}
      </div>

      {creatingTask && (
        <Card>
          <h2>Новая задача</h2>
          {workers.error && <ErrorBox message={workers.error} onRetry={workers.reload} />}
          {workers.data && workers.data.length === 0 && <Empty>Нет пользователей с ролью «Исполнитель».</Empty>}
          {workers.data && workers.data.length > 0 && (
            <TaskForm
              fixedObjectId={obj.id}
              workers={workers.data}
              submitLabel="Создать"
              onCancel={() => setCreatingTask(false)}
              onSubmit={async (values) => {
                await createTask(values);
                setCreatingTask(false);
                await tasks.reload();
              }}
            />
          )}
        </Card>
      )}

      {tasks.error && <ErrorBox message={tasks.error} onRetry={tasks.reload} />}
      {tasks.loading && !tasks.data && <Spinner />}
      {tasks.data && tasks.data.length === 0 && <Empty>Задач по объекту нет.</Empty>}
      {tasks.data && tasks.data.length > 0 && (
        <ul className="list">
          {tasks.data.map((t) => (
            <li key={t.id}>
              <Link to={`/tasks/${t.id}`} className="list-item">
                <div>
                  <div className="list-title">{t.title}</div>
                  <div className="muted">
                    {personName(t.assignee)} · {formatDate(t.created_at)}
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
