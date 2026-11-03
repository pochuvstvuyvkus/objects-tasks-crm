-- Права доступа: RLS на каждой таблице + права на уровне таблиц и столбцов.
--
-- В Supabase у ролей anon и authenticated по умолчанию есть ВСЕ права на новые таблицы
-- в схеме public. Сначала забираем всё, потом выдаём только нужное.

alter table public.profiles     enable row level security;
alter table public.objects      enable row level security;
alter table public.tasks        enable row level security;
alter table public.task_history enable row level security;

revoke all on table public.profiles, public.objects, public.tasks, public.task_history
  from public, anon, authenticated;
revoke all on sequence public.task_history_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles: только чтение. Записи в эту таблицу через API нет вообще,
-- поэтому сменить себе роль на постановщика невозможно.
-- Постановщик видит всех; исполнитель видит себя и постановщиков (их имена есть в задачах).
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or role = 'manager'::public.user_role
    or (select private.is_manager())
  );

-- ---------------------------------------------------------------------------
-- objects: постановщик видит и меняет всё; исполнитель только читает объекты,
-- где у него есть хотя бы одна задача.
-- ---------------------------------------------------------------------------
grant select, delete on public.objects to authenticated;
grant insert (name, address) on public.objects to authenticated;
grant update (name, address) on public.objects to authenticated;

create policy objects_select on public.objects
  for select to authenticated
  using (
    (select private.is_manager())
    or exists (
      select 1 from public.tasks t
      where t.object_id = objects.id and t.assignee_id = (select auth.uid())
    )
  );

create policy objects_insert on public.objects
  for insert to authenticated
  with check ((select private.is_manager()));

create policy objects_update on public.objects
  for update to authenticated
  using ((select private.is_manager()))
  with check ((select private.is_manager()));

create policy objects_delete on public.objects
  for delete to authenticated
  using ((select private.is_manager()));

-- ---------------------------------------------------------------------------
-- tasks: постановщик видит все задачи, создаёт, редактирует и удаляет их;
-- исполнитель видит только назначенные ему и не может менять ни одно поле напрямую.
-- Права на столбцы: status, author_id, created_at нельзя записать через API никому,
-- статус меняется только через change_task_status.
-- ---------------------------------------------------------------------------
grant select, delete on public.tasks to authenticated;
grant insert (title, description, object_id, assignee_id) on public.tasks to authenticated;
grant update (title, description, object_id, assignee_id) on public.tasks to authenticated;

create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (select private.is_manager())
    or assignee_id = (select auth.uid())
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ((select private.is_manager()));

create policy tasks_update on public.tasks
  for update to authenticated
  using ((select private.is_manager()))
  with check ((select private.is_manager()));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using ((select private.is_manager()));

-- ---------------------------------------------------------------------------
-- task_history: только чтение, и только по задачам, которые пользователь видит.
-- insert/update/delete не выданы никому: записи создают только триггер и change_task_status.
-- ---------------------------------------------------------------------------
grant select on public.task_history to authenticated;

create policy task_history_select on public.task_history
  for select to authenticated
  using (
    (select private.is_manager())
    or exists (
      select 1 from public.tasks t
      where t.id = task_history.task_id and t.assignee_id = (select auth.uid())
    )
  );
