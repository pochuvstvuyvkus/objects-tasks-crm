-- Демо-данные: роли пользователей, 3 объекта, 7 задач в разных статусах с историей.
--
-- Перед запуском создайте в Supabase (Authentication / Users / Add user / Create new user,
-- галочка «Auto Confirm User») трёх пользователей:
--   manager@example.com  постановщик
--   worker1@example.com  исполнитель
--   worker2@example.com  исполнитель
-- Затем выполните весь этот файл в SQL Editor.
--
-- Задачи создаются и двигаются по статусам не прямой записью, а теми же функциями,
-- что вызывает приложение (от имени нужного пользователя), поэтому история настоящая.

do $$
declare
  v_manager uuid;
  v_w1      uuid;
  v_w2      uuid;
  o1 uuid; o2 uuid; o3 uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; t6 uuid; t7 uuid;
begin
  select id into v_manager from auth.users where email = 'manager@example.com';
  select id into v_w1      from auth.users where email = 'worker1@example.com';
  select id into v_w2      from auth.users where email = 'worker2@example.com';

  if v_manager is null or v_w1 is null or v_w2 is null then
    raise exception 'Сначала создайте пользователей manager@example.com, worker1@example.com, worker2@example.com';
  end if;

  -- Роли и имена. Через API это сделать нельзя, только здесь.
  insert into public.profiles (id, email) values
    (v_manager, 'manager@example.com'),
    (v_w1, 'worker1@example.com'),
    (v_w2, 'worker2@example.com')
  on conflict (id) do nothing;

  update public.profiles set role = 'manager', full_name = 'Анна Петрова'   where id = v_manager;
  update public.profiles set role = 'worker',  full_name = 'Иван Смирнов'   where id = v_w1;
  update public.profiles set role = 'worker',  full_name = 'Олег Кузнецов'  where id = v_w2;

  if exists (select 1 from public.objects) then
    raise notice 'Объекты уже есть, демо-данные не добавлены (роли обновлены).';
    return;
  end if;

  -- Действуем от имени постановщика.
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);

  insert into public.objects (name, address) values ('ЖК «Северный», корпус 2', 'г. Москва, ул. Строителей, 12')
    returning id into o1;
  insert into public.objects (name, address) values ('Коттедж в посёлке Лесной', 'Московская обл., пос. Лесной, ул. Сосновая, 7')
    returning id into o2;
  insert into public.objects (name, address) values ('Офисный центр «Гранит»', 'г. Москва, Каширское ш., 45')
    returning id into o3;

  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Залить фундамент секции Б', 'Бетон В25, приёмка арматуры до заливки.', o1, v_w1) returning id into t1;
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Смонтировать опалубку 3 этажа', 'Щитовая опалубка, по ППР.', o1, v_w1) returning id into t2;
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Армирование перекрытия 2 этажа', 'Шаг арматуры по проекту 200 мм.', o1, v_w2) returning id into t3;
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Устройство кровли', 'Металлочерепица, утепление 200 мм.', o2, v_w2) returning id into t4;
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Закупить утеплитель', 'Минвата 50 м³, доставка на объект.', o2, v_w1) returning id into t5;
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Демонтаж перегородок 2 этажа', 'Вывоз мусора за счёт подрядчика.', o3, v_w2) returning id into t6;
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Электромонтаж щитовой', 'Сборка ВРУ, маркировка линий.', o3, v_w2) returning id into t7;

  -- Исполнитель 1.
  perform set_config('request.jwt.claims', json_build_object('sub', v_w1, 'role', 'authenticated')::text, true);
  perform public.change_task_status(t1, 'in_progress');
  perform public.change_task_status(t1, 'review', 'Фундамент залит, фото в чате.');
  perform public.change_task_status(t2, 'in_progress');
  perform public.change_task_status(t2, 'review');

  -- Исполнитель 2.
  perform set_config('request.jwt.claims', json_build_object('sub', v_w2, 'role', 'authenticated')::text, true);
  perform public.change_task_status(t3, 'in_progress');
  perform public.change_task_status(t3, 'review');
  perform public.change_task_status(t4, 'in_progress');
  perform public.change_task_status(t7, 'in_progress');
  perform public.change_task_status(t7, 'review');

  -- Постановщик проверяет.
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  perform public.change_task_status(t1, 'accepted');
  perform public.change_task_status(t3, 'rework', 'Шаг арматуры 250 мм вместо 200 по проекту. Переделать.');
  perform public.change_task_status(t7, 'rework', 'Нет маркировки на трёх линиях.');

  -- Исполнитель 2 снова берёт щитовую в работу.
  perform set_config('request.jwt.claims', json_build_object('sub', v_w2, 'role', 'authenticated')::text, true);
  perform public.change_task_status(t7, 'in_progress', 'Доделываю маркировку.');

  perform set_config('request.jwt.claims', '', true);

  -- Разносим даты по последним дням, чтобы история выглядела естественно.
  -- Триггер защиты дат на время сида выключается и сразу включается обратно.
  alter table public.tasks disable trigger tasks_before_update;
  update public.tasks t
     set created_at = now() - make_interval(days => d.days_ago)
    from (values (t1, 9), (t2, 7), (t3, 6), (t4, 4), (t5, 2), (t6, 1), (t7, 8)) as d(task_id, days_ago)
   where t.id = d.task_id;
  alter table public.tasks enable trigger tasks_before_update;

  update public.task_history h
     set created_at = t.created_at + (h_rn.rn - 1) * interval '19 hours'
    from (
      select h2.id, h2.task_id, row_number() over (partition by h2.task_id order by h2.id) as rn
      from public.task_history h2
    ) h_rn
    join public.tasks t on t.id = h_rn.task_id
   where h.id = h_rn.id;
end;
$$;
