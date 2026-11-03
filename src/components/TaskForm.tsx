import { useState, type FormEvent } from 'react';
import type { TaskInput } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { personName } from '../lib/format';
import { ErrorBox } from './ui';

type Option = { id: string; label: string };

type Props = {
  initial?: TaskInput;
  /** Если задан, объект фиксирован (создание из карточки объекта). */
  fixedObjectId?: string;
  objects?: Option[];
  workers: { id: string; full_name: string; email: string }[];
  submitLabel: string;
  onSubmit: (values: TaskInput) => Promise<void>;
  onCancel?: () => void;
};

export function TaskForm({ initial, fixedObjectId, objects, workers, submitLabel, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [objectId, setObjectId] = useState(fixedObjectId ?? initial?.object_id ?? '');
  const [assigneeId, setAssigneeId] = useState(initial?.assignee_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !objectId || !assigneeId) {
      setError('Заполните название, объект и исполнителя.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        object_id: objectId,
        assignee_id: assigneeId,
      });
      if (!initial) {
        setTitle('');
        setDescription('');
        setAssigneeId('');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Название</span>
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="field">
        <span>Описание</span>
        <textarea
          rows={3}
          value={description}
          maxLength={5000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="form-row">
        {!fixedObjectId && objects && (
          <label className="field">
            <span>Объект</span>
            <select value={objectId} onChange={(e) => setObjectId(e.target.value)} required>
              <option value="" disabled>
                Выберите объект
              </option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Исполнитель</span>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required>
            <option value="" disabled>
              Выберите исполнителя
            </option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {personName(w)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Сохраняем…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
