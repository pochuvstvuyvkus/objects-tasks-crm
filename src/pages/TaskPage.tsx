import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  changeTaskStatus,
  deleteTask,
  fetchObjects,
  fetchTask,
  fetchTaskHistory,
  fetchWorkers,
  updateTask,
} from '../lib/api';
import { useProfile } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import { formatDateTime, personName } from '../lib/format';
import { STATUS_LABEL, availableTransitions, type Transition } from '../lib/status';
import { useLoader } from '../lib/useLoader';
import { TaskForm } from '../components/TaskForm';
import { Card, Empty, ErrorBox, Spinner, StatusBadge } from '../components/ui';

export function TaskPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const profile = useProfile();
  const isManager = profile.role === 'manager';

  const task = useLoader(() => fetchTask(taskId), [taskId]);
  const history = useLoader(() => fetchTaskHistory(taskId), [taskId]);

  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (task.loading && !task.data) return <Spinner />;
  if (task.error) return <ErrorBox message={task.error} onRetry={task.reload} />;
  if (!task.data) {
    return (
      <Empty>
        Задача не найдена или у вас нет к ней доступа. <Link to="/">На главную</Link>
      </Empty>
    );
  }

  const t = task.data;
  const transitions = availableTransitions(t, profile);
  const canEdit = isManager && t.status !== 'accepted';

  const runTransition = async (tr: Transition) => {
    if (tr.needsComment && !comment.trim()) {
      setActionError('Для возврата на доработку напишите комментарий.');
      return;
    }
    setBusy(tr.to);
    setActionError(null);
    try {
      await changeTaskStatus(t.id, tr.to, comment);
      setComment('');
      await Promise.all([task.reload(), history.reload()]);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Удалить задачу «${t.title}» вместе с историей?`)) return;
    setBusy('delete');
    setActionError(null);
    try {
      await deleteTask(t.id);
      navigate(t.object ? `/objects/${t.object.id}` : '/objects', { replace: true });
    } catch (e) {
      setActionError(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <>
      {t.object && (
        <Link to={`/objects/${t.object.id}`} className="back">
          ← {t.object.name}
        </Link>
      )}

      <Card>
        {editing ? (
          <EditTask
            task={t}
            onCancel={() => setEditing(false)}
            onSaved={async () => {
              setEditing(false);
              await task.reload();
            }}
          />
        ) : (
          <>
            <div className="page-head">
              <h1>{t.title}</h1>
              <StatusBadge status={t.status} />
            </div>

            {t.description && <p className="description">{t.description}</p>}

            <dl className="props">
              <dt>Объект</dt>
              <dd>{t.object ? `${t.object.name}, ${t.object.address}` : '—'}</dd>
              <dt>Исполнитель</dt>
              <dd>{personName(t.assignee)}</dd>
              <dt>Автор</dt>
              <dd>{personName(t.author)}</dd>
              <dt>Создана</dt>
              <dd>{formatDateTime(t.created_at)}</dd>
            </dl>

            {transitions.length > 0 && (
              <div className="transition-box">
                <label className="field">
                  <span>Комментарий</span>
                  <textarea
                    rows={2}
                    value={comment}
                    maxLength={2000}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <div className="actions">
                  {transitions.map((tr) => (
                    <button
                      key={tr.to}
                      type="button"
                      className={`btn ${tr.tone === 'primary' ? 'btn-primary' : tr.tone === 'danger' ? 'btn-danger' : ''}`}
                      disabled={busy !== null || (tr.needsComment && !comment.trim())}
                      onClick={() => void runTransition(tr)}
                    >
                      {busy === tr.to ? 'Сохраняем…' : tr.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isManager && (
              <div className="actions manage">
                {canEdit && (
                  <button type="button" className="btn" onClick={() => setEditing(true)} disabled={busy !== null}>
                    Изменить
                  </button>
                )}
                <button type="button" className="btn btn-danger-ghost" onClick={onDelete} disabled={busy !== null}>
                  {busy === 'delete' ? 'Удаляем…' : 'Удалить задачу'}
                </button>
              </div>
            )}

            {actionError && <ErrorBox message={actionError} />}
          </>
        )}
      </Card>

      <h2>История</h2>
      {history.error && <ErrorBox message={history.error} onRetry={history.reload} />}
      {history.loading && !history.data && <Spinner />}
      {history.data && history.data.length === 0 && <Empty>Записей нет.</Empty>}
      {history.data && history.data.length > 0 && (
        <ol className="timeline">
          {history.data.map((h) => (
            <li key={h.id}>
              <div className="timeline-head">
                <span className="timeline-status">
                  {h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : 'Создана: '}
                  {STATUS_LABEL[h.to_status]}
                </span>
                <span className="muted">
                  {personName(h.person)} · {formatDateTime(h.created_at)}
                </span>
              </div>
              {h.comment && <div className="timeline-comment">{h.comment}</div>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

type EditTaskProps = {
  task: NonNullable<Awaited<ReturnType<typeof fetchTask>>>;
  onCancel: () => void;
  onSaved: () => Promise<void>;
};

function EditTask({ task, onCancel, onSaved }: EditTaskProps) {
  const workers = useLoader(fetchWorkers, []);
  const objects = useLoader(fetchObjects, []);

  if (workers.error) return <ErrorBox message={workers.error} onRetry={workers.reload} />;
  if (objects.error) return <ErrorBox message={objects.error} onRetry={objects.reload} />;
  if (!workers.data || !objects.data) return <Spinner />;

  return (
    <>
      <h2>Редактирование задачи</h2>
      <TaskForm
        initial={{
          title: task.title,
          description: task.description,
          object_id: task.object_id,
          assignee_id: task.assignee_id,
        }}
        objects={objects.data.map((o) => ({ id: o.id, label: o.name }))}
        workers={workers.data}
        submitLabel="Сохранить"
        onCancel={onCancel}
        onSubmit={async (values) => {
          await updateTask(task.id, values);
          await onSaved();
        }}
      />
    </>
  );
}
