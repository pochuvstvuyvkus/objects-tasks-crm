type ErrorLike = { message?: unknown; code?: unknown };

/** Человекочитаемый текст ошибки Supabase/PostgREST. Ошибки из функций базы уже на русском. */
export function errorMessage(error: unknown): string {
  if (!error) return 'Неизвестная ошибка';
  const e = error as ErrorLike;
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : String(error);

  if (code === '23503') return 'Нельзя удалить: есть связанные записи. Сначала удалите задачи объекта.';
  if (code === '23514') return 'Проверьте заполнение полей.';
  if (/permission denied|row-level security/i.test(message)) return 'Недостаточно прав для этого действия.';
  if (/Invalid login credentials/i.test(message)) return 'Неверный email или пароль.';
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Нет связи с сервером. Проверьте интернет.';
  return message;
}
