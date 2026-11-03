import { useState, type FormEvent } from 'react';
import { errorMessage } from '../lib/errors';
import { ErrorBox } from './ui';

type Values = { name: string; address: string };

type Props = {
  initial?: Values;
  submitLabel: string;
  onSubmit: (values: Values) => Promise<void>;
  onCancel?: () => void;
};

export function ObjectForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      setError('Заполните название и адрес.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), address: address.trim() });
      if (!initial) {
        setName('');
        setAddress('');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label className="field">
          <span>Название</span>
          <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Адрес</span>
          <input value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} required />
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
