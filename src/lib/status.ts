import type { Profile, TaskRow, TaskStatus, UserRole } from './database.types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
};

export const STATUS_ORDER: TaskStatus[] = ['new', 'in_progress', 'review', 'rework', 'accepted'];

export const ROLE_LABEL: Record<UserRole, string> = {
  manager: 'Постановщик',
  worker: 'Исполнитель',
};

export type Transition = {
  from: TaskStatus;
  to: TaskStatus;
  role: UserRole;
  label: string;
  needsComment?: boolean;
  tone: 'primary' | 'danger' | 'default';
};

/**
 * Таблица переходов из ТЗ. Та же таблица проверяется в базе (public.change_task_status),
 * здесь она нужна только чтобы показать пользователю доступные кнопки.
 */
export const TRANSITIONS: Transition[] = [
  { from: 'new', to: 'in_progress', role: 'worker', label: 'Взять в работу', tone: 'primary' },
  { from: 'in_progress', to: 'review', role: 'worker', label: 'Отправить на проверку', tone: 'primary' },
  { from: 'review', to: 'accepted', role: 'manager', label: 'Принять', tone: 'primary' },
  { from: 'review', to: 'rework', role: 'manager', label: 'Вернуть на доработку', needsComment: true, tone: 'danger' },
  { from: 'rework', to: 'in_progress', role: 'worker', label: 'Взять в работу', tone: 'primary' },
];

export function availableTransitions(
  task: Pick<TaskRow, 'status' | 'assignee_id'>,
  profile: Pick<Profile, 'id' | 'role'>,
): Transition[] {
  return TRANSITIONS.filter(
    (t) =>
      t.from === task.status &&
      t.role === profile.role &&
      (profile.role === 'manager' || task.assignee_id === profile.id),
  );
}
