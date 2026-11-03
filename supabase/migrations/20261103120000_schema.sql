-- Мини-CRM «Объекты и задачи»: таблицы и типы.
-- Роли: manager = постановщик, worker = исполнитель.
-- Статусы: new = Новая, in_progress = В работе, review = На проверке,
--          accepted = Принята, rework = На доработке.

create type public.user_role as enum ('manager', 'worker');
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

-- Профиль пользователя. Строка создаётся триггером при добавлении пользователя в auth.users.
-- Роль меняется только из SQL-редактора (у API нет прав на запись в эту таблицу).
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  email      text not null default '',
  role       public.user_role not null default 'worker',
  created_at timestamptz not null default now()
);

-- Объект (стройка).
create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 200),
  address    text not null check (length(btrim(address)) between 1 and 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Задача по объекту.
-- Объект нельзя удалить, пока в нём есть задачи (on delete restrict).
-- Исполнителя нельзя удалить, пока за ним числятся задачи.
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 5000),
  object_id   uuid not null references public.objects (id) on delete restrict,
  assignee_id uuid not null references public.profiles (id) on delete restrict,
  status      public.task_status not null default 'new',
  author_id   uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_object_id_idx on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

-- История смены статусов. Пишется только функциями базы (триггер и change_task_status).
-- При удалении задачи постановщиком её история удаляется вместе с ней.
create table public.task_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  from_status public.task_status,
  to_status   public.task_status not null,
  changed_by  uuid references public.profiles (id) on delete set null,
  comment     text check (comment is null or length(comment) <= 2000),
  created_at  timestamptz not null default now()
);

create index task_history_task_id_idx on public.task_history (task_id, created_at);
