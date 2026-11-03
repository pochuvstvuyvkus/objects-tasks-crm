import { supabase } from './supabase';
import type { TaskStatus } from './database.types';

// Все запросы идут с ключом anon и токеном пользователя. Что вернётся и что можно изменить,
// решают политики RLS в базе; здесь только удобные обёртки с типами.

const PERSON = 'id, full_name, email';

function ensureChanged(rows: unknown[] | null, what: string) {
  if (!rows || rows.length === 0) {
    throw new Error(`${what}: запись не найдена или у вас нет прав на это действие.`);
  }
}

// ---------- Профили ----------

export async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchWorkers() {
  const { data, error } = await supabase
    .from('profiles')
    .select(PERSON)
    .eq('role', 'worker')
    .order('full_name');
  if (error) throw error;
  return data;
}

// ---------- Объекты ----------

export async function fetchObjects() {
  const { data, error } = await supabase
    .from('objects')
    .select('id, name, address, created_at, tasks(status)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(({ tasks, ...object }) => ({
    ...object,
    taskCount: tasks.length,
    openCount: tasks.filter((t) => t.status !== 'accepted').length,
  }));
}

export type ObjectListItem = Awaited<ReturnType<typeof fetchObjects>>[number];

export async function fetchObject(id: string) {
  const { data, error } = await supabase.from('objects').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createObject(input: { name: string; address: string }) {
  const { data, error } = await supabase.from('objects').insert(input).select('id').single();
  if (error) throw error;
  return data;
}

export async function updateObject(id: string, input: { name: string; address: string }) {
  const { data, error } = await supabase.from('objects').update(input).eq('id', id).select('id');
  if (error) throw error;
  ensureChanged(data, 'Объект не изменён');
}

export async function deleteObject(id: string) {
  const { data, error } = await supabase.from('objects').delete().eq('id', id).select('id');
  if (error) throw error;
  ensureChanged(data, 'Объект не удалён');
}

// ---------- Задачи ----------

export async function fetchObjectTasks(objectId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`id, title, status, created_at, assignee:profiles!tasks_assignee_id_fkey(${PERSON})`)
    .eq('object_id', objectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchMyTasks(userId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, created_at, updated_at, object:objects(id, name)')
    .eq('assignee_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchTask(id: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `*, object:objects(id, name, address),
       assignee:profiles!tasks_assignee_id_fkey(${PERSON}),
       author:profiles!tasks_author_id_fkey(${PERSON})`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type TaskDetails = NonNullable<Awaited<ReturnType<typeof fetchTask>>>;

export async function fetchTaskHistory(taskId: string) {
  const { data, error } = await supabase
    .from('task_history')
    .select(`id, from_status, to_status, comment, created_at, changed_by, person:profiles!task_history_changed_by_fkey(${PERSON})`)
    .eq('task_id', taskId)
    .order('id', { ascending: true });
  if (error) throw error;
  return data;
}

export type TaskInput = {
  title: string;
  description: string;
  object_id: string;
  assignee_id: string;
};

export async function createTask(input: TaskInput) {
  // status и author_id не передаются: их проставляет база (статус «Новая», автор = текущий пользователь).
  const { data, error } = await supabase.from('tasks').insert(input).select('id').single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, input: TaskInput) {
  const { data, error } = await supabase.from('tasks').update(input).eq('id', id).select('id');
  if (error) throw error;
  ensureChanged(data, 'Задача не изменена');
}

export async function deleteTask(id: string) {
  const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id');
  if (error) throw error;
  ensureChanged(data, 'Задача не удалена');
}

export async function changeTaskStatus(taskId: string, to: TaskStatus, comment?: string) {
  const { error } = await supabase.rpc('change_task_status', {
    p_task_id: taskId,
    p_to_status: to,
    ...(comment?.trim() ? { p_comment: comment.trim() } : {}),
  });
  if (error) throw error;
}
