const dateTime = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const date = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => date.format(new Date(iso));

/** Имя сотрудника. Исполнитель не видит профили других исполнителей, тогда профиль приходит пустым. */
export function personName(p: { full_name: string; email: string } | null | undefined): string {
  if (!p) return 'Другой сотрудник';
  return p.full_name || p.email || 'Без имени';
}
