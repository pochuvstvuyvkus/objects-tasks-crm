import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Текст ошибки, если переменные окружения не заданы (показывается вместо приложения). */
export const configError =
  !url || !anonKey ? 'Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (см. .env.example).' : null;

// Во фронтенде только публичный anon-ключ: всё, что он позволяет, ограничено правилами RLS в базе.
export const supabase = createClient<Database>(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});
