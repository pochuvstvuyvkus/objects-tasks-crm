-- Служебные функции, триггеры и единственная точка смены статуса: change_task_status.
--
-- Схема private не публикуется через API Supabase (наружу видна только public),
-- поэтому функции из неё нельзя вызвать запросом /rpc/... Они используются в политиках и триггерах.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Роль текущего пользователя. security definer: читает profiles в обход RLS,
-- иначе политика profiles ссылалась бы сама на себя.
-- ---------------------------------------------------------------------------
create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'manager'::public.user_role, false)
$$;

create or replace function private.status_label(s public.task_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'new' then 'Новая'
    when 'in_progress' then 'В работе'
    when 'review' then 'На проверке'
    when 'accepted' then 'Принята'
    when 'rework' then 'На доработке'
  end
$$;

-- Исполнителем задачи может быть только пользователь с ролью worker.
create or replace function private.assert_worker(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'worker'::public.user_role
  ) then
    raise exception 'Исполнителем можно назначить только пользователя с ролью «Исполнитель»'
      using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Профиль создаётся автоматически при добавлении пользователя (Dashboard → Add user).
-- Роль по умолчанию: исполнитель. Повысить до постановщика можно только из SQL-редактора.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Пользователи, созданные до применения миграции, тоже получают профиль.
insert into public.profiles (id, email)
select u.id, coalesce(u.email, '') from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Объекты: автор проставляется базой.
-- ---------------------------------------------------------------------------
create or replace function private.objects_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := coalesce((select auth.uid()), new.created_by);
  new.created_at := now();
  return new;
end;
$$;

create trigger objects_before_insert
  before insert on public.objects
  for each row execute function private.objects_before_insert();

-- ---------------------------------------------------------------------------
-- Задачи: при создании статус всегда «Новая», автор = текущий пользователь.
-- ---------------------------------------------------------------------------
create or replace function private.tasks_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Запрос через API всегда несёт пользователя: автором становится он, подменить нельзя.
  -- auth.uid() пуст только при запуске из SQL-редактора (сид), там автор берётся из запроса.
  if v_uid is not null then
    new.author_id := v_uid;
  end if;
  new.status := 'new';
  new.created_at := now();
  new.updated_at := now();
  perform private.assert_worker(new.assignee_id);
  return new;
end;
$$;

create trigger tasks_before_insert
  before insert on public.tasks
  for each row execute function private.tasks_before_insert();

-- Первая запись истории: «— → Новая».
create or replace function private.tasks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_history (task_id, from_status, to_status, changed_by, created_at)
  values (new.id, null, new.status, new.author_id, new.created_at);
  return null;
end;
$$;

create trigger tasks_after_insert
  after insert on public.tasks
  for each row execute function private.tasks_after_insert();

-- Защита от изменения статуса и служебных полей в обход change_task_status.
-- Права на столбцы (см. следующую миграцию) уже не дают это сделать через API,
-- триггер страхует на случай ошибки в правах.
create or replace function private.tasks_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Идентификатор, автор и дата создания задачи не меняются'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if coalesce(current_setting('app.status_change', true), '') <> 'on' then
      raise exception 'Статус меняется только через change_task_status'
        using errcode = '42501';
    end if;
  elsif old.status = 'accepted' then
    raise exception 'Принятую задачу нельзя редактировать'
      using errcode = '42501';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    perform private.assert_worker(new.assignee_id);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function private.tasks_before_update();

-- ---------------------------------------------------------------------------
-- Смена статуса. Единственный способ поменять статус задачи через API.
--
--   Новая        → В работе      назначенный исполнитель
--   В работе     → На проверке   назначенный исполнитель
--   На проверке  → Принята       постановщик
--   На проверке  → На доработке  постановщик, комментарий обязателен
--   На доработке → В работе      назначенный исполнитель
--
-- Каждая смена пишется в task_history здесь же, в той же транзакции.
-- ---------------------------------------------------------------------------
create or replace function public.change_task_status(
  p_task_id   uuid,
  p_to_status public.task_status,
  p_comment   text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    public.user_role;
  v_task    public.tasks;
  v_from    public.task_status;
  v_key     text;
  v_allowed boolean := false;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    raise exception 'Требуется вход в систему' using errcode = '28000';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null then
    raise exception 'Профиль пользователя не найден' using errcode = '42501';
  end if;

  select * into v_task from public.tasks t where t.id = p_task_id for update;

  -- Для чужой задачи исполнитель получает тот же ответ, что и для несуществующей:
  -- так нельзя даже узнать, что задача существует.
  if not found or (v_role = 'worker' and v_task.assignee_id <> v_uid) then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  v_from := v_task.status;
  v_key := v_from::text || '>' || p_to_status::text;

  if v_role = 'worker' then
    v_allowed := v_key in ('new>in_progress', 'in_progress>review', 'rework>in_progress');
  elsif v_role = 'manager' then
    v_allowed := v_key in ('review>accepted', 'review>rework');
  end if;

  if not v_allowed then
    raise exception 'Переход из статуса «%» в статус «%» вам недоступен',
      private.status_label(v_from), private.status_label(p_to_status)
      using errcode = '42501';
  end if;

  if p_to_status = 'rework' and v_comment is null then
    raise exception 'При возврате на доработку комментарий обязателен'
      using errcode = '22023';
  end if;

  if v_comment is not null and length(v_comment) > 2000 then
    raise exception 'Комментарий длиннее 2000 символов' using errcode = '22001';
  end if;

  perform set_config('app.status_change', 'on', true);
  update public.tasks t set status = p_to_status where t.id = p_task_id returning * into v_task;
  perform set_config('app.status_change', '', true);

  insert into public.task_history (task_id, from_status, to_status, changed_by, comment)
  values (p_task_id, v_from, p_to_status, v_uid, v_comment);

  return v_task;
end;
$$;

comment on function public.change_task_status(uuid, public.task_status, text) is
  'Смена статуса задачи с проверкой роли, исполнителя и допустимого перехода. Пишет историю.';

-- ---------------------------------------------------------------------------
-- Права на функции. По умолчанию execute есть у всех (PUBLIC), убираем.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_manager() to authenticated;
grant execute on function private.assert_worker(uuid) to authenticated;

revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
