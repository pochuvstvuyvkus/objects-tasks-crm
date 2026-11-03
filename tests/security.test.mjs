// Проверка правил доступа на настоящем PostgreSQL (PGlite: Postgres, собранный в WebAssembly).
//
// 1. Поднимаем пустую базу и заглушку схемы auth так, как она устроена в Supabase:
//    роли anon/authenticated, таблица auth.users, функция auth.uid() читает request.jwt.claims.
//    Как в Supabase, выдаём anon/authenticated все права по умолчанию на новые объекты в public,
//    чтобы проверить, что миграции их действительно забирают.
// 2. Применяем supabase/migrations/*.sql и supabase/seed.sql без изменений.
// 3. От имени разных пользователей (SET ROLE authenticated + JWT claims) выполняем запросы,
//    которые клиент может прислать в обход интерфейса, и проверяем результат.
//
// Запуск: npm run test:db

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();

// ---------------------------------------------------------------------------
// Заглушка Supabase
// ---------------------------------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  -- Так же, как auth.uid() в Supabase.
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  -- Права по умолчанию, как в проекте Supabase.
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

const migrationsDir = join(root, 'supabase', 'migrations');
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
}

// Пользователи создаются так же, как через Dashboard: вставкой в auth.users (профиль создаст триггер).
const users = {};
for (const email of ['manager@example.com', 'manager2@example.com', 'worker1@example.com', 'worker2@example.com']) {
  const { rows } = await db.query('insert into auth.users (email) values ($1) returning id', [email]);
  users[email.split('@')[0]] = rows[0].id;
}
const { rows: autoProfiles } = await db.query('select count(*)::int as n from public.profiles where role = $1', ['worker']);
await db.exec(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'));
await db.query(`update public.profiles set role = 'manager', full_name = 'Второй постановщик' where id = $1`, [users.manager2]);

// ---------------------------------------------------------------------------
// Помощники
// ---------------------------------------------------------------------------
async function actAs(userKey) {
  await db.exec('reset role');
  if (userKey === 'anon') {
    await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', false)`);
    await db.exec('set role anon');
    return;
  }
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: users[userKey], role: 'authenticated' }),
  ]);
  await db.exec('set role authenticated');
}

async function asAdmin() {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', '', false)`);
}

async function q(sql, params = []) {
  return db.query(sql, params);
}

// Запрос от имени владельца базы (как SQL Editor). Текущая роль и пользователь потом восстанавливаются.
async function admin(sql, params = []) {
  const { rows } = await db.query(`select current_user as r, current_setting('request.jwt.claims', true) as c`);
  const saved = rows[0];
  await asAdmin();
  try {
    return await db.query(sql, params);
  } finally {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [saved.c ?? '']);
    if (saved.r !== 'postgres') await db.exec(`set role ${saved.r}`);
  }
}

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  // Проверки идут по порядку и работают с общими данными: часть из них специально двигает статусы.
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  } finally {
    await asAdmin();
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function expectError(promiseFn, pattern) {
  try {
    await promiseFn();
  } catch (e) {
    if (pattern && !pattern.test(`${e.code ?? ''} ${e.message}`)) {
      throw new Error(`ошибка есть, но не та: [${e.code}] ${e.message}`);
    }
    return e;
  }
  throw new Error('запрос прошёл, а должен был быть отклонён');
}

const DENIED = /42501|permission denied|row-level security/;

async function taskId(title) {
  const { rows } = await admin('select id from public.tasks where title = $1', [title]);
  assert(rows.length === 1, `нет задачи «${title}»`);
  return rows[0].id;
}

async function taskRow(id) {
  return (await admin('select * from public.tasks where id = $1', [id])).rows[0];
}

const T = {
  w1New: await taskId('Закупить утеплитель'),
  w1Review: await taskId('Смонтировать опалубку 3 этажа'),
  w1Accepted: await taskId('Залить фундамент секции Б'),
  w2Rework: await taskId('Армирование перекрытия 2 этажа'),
  w2InProgress: await taskId('Устройство кровли'),
  w2New: await taskId('Демонтаж перегородок 2 этажа'),
};
const objectGranit = (await admin(`select id from public.objects where name like 'Офисный центр%'`)).rows[0].id;

// ---------------------------------------------------------------------------
console.log('\nСид и базовая настройка');
// ---------------------------------------------------------------------------
await test('новый пользователь получает профиль с ролью «исполнитель» автоматически', async () => {
  assert(autoProfiles[0].n === 4, `ожидалось 4 профиля worker, есть ${autoProfiles[0].n}`);
});

await test('сид создал 3 объекта, 7 задач во всех пяти статусах и историю', async () => {
  const { rows } = await admin(`select count(*)::int as n, count(distinct status)::int as s from public.tasks`);
  assert(rows[0].n === 7 && rows[0].s === 5, JSON.stringify(rows[0]));
  const h = await admin('select count(*)::int as n from public.task_history');
  assert(h.rows[0].n === 20, `записей истории ${h.rows[0].n}, ожидалось 20`);
});

await test('RLS включён на всех таблицах public', async () => {
  const { rows } = await admin(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert(rows.length === 0, `без RLS: ${rows.map((r) => r.relname).join(', ')}`);
});

// ---------------------------------------------------------------------------
console.log('\nАноним (без входа)');
// ---------------------------------------------------------------------------
for (const table of ['profiles', 'objects', 'tasks', 'task_history']) {
  await test(`не читает ${table}`, async () => {
    await actAs('anon');
    await expectError(() => q(`select * from public.${table}`), DENIED);
  });
}
await test('не может вызвать change_task_status', async () => {
  await actAs('anon');
  await expectError(() => q(`select public.change_task_status($1, 'in_progress')`, [T.w1New]), DENIED);
});

// ---------------------------------------------------------------------------
console.log('\nИсполнитель: чтение');
// ---------------------------------------------------------------------------
await test('видит только свои задачи', async () => {
  await actAs('worker1');
  const { rows } = await q('select assignee_id from public.tasks');
  assert(rows.length === 3, `видит ${rows.length} задач, своих 3`);
  assert(rows.every((r) => r.assignee_id === users.worker1), 'среди видимых есть чужие');
});

await test('чужую задачу по id не получает', async () => {
  await actAs('worker1');
  const { rows } = await q('select * from public.tasks where id = $1', [T.w2InProgress]);
  assert(rows.length === 0, 'чужая задача прочитана');
});

await test('видит только объекты, где у него есть задачи', async () => {
  await actAs('worker1');
  const { rows } = await q('select id from public.objects');
  assert(rows.length === 2, `видит ${rows.length} объектов, ожидалось 2`);
  assert(!rows.some((r) => r.id === objectGranit), 'видит объект без своих задач');
});

await test('не читает историю чужой задачи', async () => {
  await actAs('worker1');
  const { rows } = await q('select * from public.task_history where task_id = $1', [T.w2Rework]);
  assert(rows.length === 0, 'история чужой задачи прочитана');
});

await test('видит себя и постановщиков, но не других исполнителей', async () => {
  await actAs('worker1');
  const { rows } = await q('select id, role from public.profiles');
  assert(!rows.some((r) => r.id === users.worker2), 'видит профиль другого исполнителя');
  assert(rows.some((r) => r.id === users.worker1), 'не видит себя');
  assert(rows.some((r) => r.id === users.manager), 'не видит постановщика');
});

// ---------------------------------------------------------------------------
console.log('\nИсполнитель: запись в обход интерфейса');
// ---------------------------------------------------------------------------
await test('не меняет название своей задачи', async () => {
  await actAs('worker1');
  await q(`update public.tasks set title = 'взлом' where id = $1`, [T.w1New]);
  assert((await taskRow(T.w1New)).title === 'Закупить утеплитель', 'название изменилось');
});

await test('не переназначает задачу и не переносит в другой объект', async () => {
  await actAs('worker1');
  await q(`update public.tasks set assignee_id = $2, object_id = $3 where id = $1`, [T.w1New, users.worker2, objectGranit]);
  const row = await taskRow(T.w1New);
  assert(row.assignee_id === users.worker1 && row.object_id !== objectGranit, 'поля изменились');
});

await test('не меняет статус прямым UPDATE', async () => {
  await actAs('worker1');
  await expectError(() => q(`update public.tasks set status = 'accepted' where id = $1`, [T.w1Review]), DENIED);
});

await test('не меняет автора и дату создания', async () => {
  await actAs('worker1');
  await expectError(() => q(`update public.tasks set author_id = $2 where id = $1`, [T.w1New, users.worker1]), DENIED);
  await expectError(() => q(`update public.tasks set created_at = now() where id = $1`, [T.w1New]), DENIED);
});

await test('не меняет чужую задачу', async () => {
  await actAs('worker1');
  await q(`update public.tasks set title = 'взлом' where id = $1`, [T.w2New]);
  assert((await taskRow(T.w2New)).title === 'Демонтаж перегородок 2 этажа', 'чужая задача изменена');
});

await test('не создаёт задачи', async () => {
  await actAs('worker1');
  const objectId = (await taskRow(T.w1New)).object_id;
  await expectError(
    () => q(`insert into public.tasks (title, object_id, assignee_id) values ('своя', $1, $2)`, [objectId, users.worker1]),
    DENIED,
  );
});

await test('не удаляет задачи', async () => {
  await actAs('worker1');
  await q('delete from public.tasks where id = $1', [T.w1New]);
  assert(await taskRow(T.w1New), 'задача удалена');
});

await test('не создаёт, не меняет и не удаляет объекты', async () => {
  await actAs('worker1');
  await expectError(() => q(`insert into public.objects (name, address) values ('x', 'y')`), DENIED);
  const objectId = (await taskRow(T.w1New)).object_id;
  await q(`update public.objects set name = 'взлом' where id = $1`, [objectId]);
  await q('delete from public.objects where id = $1', [objectId]);
  const { rows } = await admin('select name from public.objects where id = $1', [objectId]);
  assert(rows.length === 1 && rows[0].name !== 'взлом', 'объект изменён или удалён');
});

await test('не добавляет запись в историю', async () => {
  await actAs('worker1');
  await expectError(
    () => q(`insert into public.task_history (task_id, from_status, to_status, changed_by) values ($1, 'review', 'accepted', $2)`,
      [T.w1Review, users.manager]),
    DENIED,
  );
});

await test('не меняет и не удаляет историю', async () => {
  await actAs('worker1');
  await expectError(() => q(`update public.task_history set comment = 'подделка' where task_id = $1`, [T.w1Accepted]), DENIED);
  await expectError(() => q('delete from public.task_history where task_id = $1', [T.w1Accepted]), DENIED);
  await expectError(() => q('truncate public.task_history'), DENIED);
});

await test('не повышает себе роль до постановщика', async () => {
  await actAs('worker1');
  await expectError(() => q(`update public.profiles set role = 'manager' where id = $1`, [users.worker1]), DENIED);
  await expectError(() => q(`insert into public.profiles (id, role) values (gen_random_uuid(), 'manager')`), DENIED);
  const { rows } = await admin('select role from public.profiles where id = $1', [users.worker1]);
  assert(rows[0].role === 'worker', 'роль изменилась');
});

// ---------------------------------------------------------------------------
console.log('\nИсполнитель: переходы статусов');
// ---------------------------------------------------------------------------
await test('не двигает чужую задачу (ответ как для несуществующей)', async () => {
  await actAs('worker1');
  await expectError(() => q(`select public.change_task_status($1, 'review')`, [T.w2InProgress]), /Задача не найдена/);
});

await test('не перепрыгивает статусы: Новая → На проверке / Принята', async () => {
  await actAs('worker1');
  await expectError(() => q(`select public.change_task_status($1, 'review')`, [T.w1New]), /недоступен/);
  await expectError(() => q(`select public.change_task_status($1, 'accepted')`, [T.w1New]), /недоступен/);
});

await test('не принимает задачу и не возвращает её на доработку сам', async () => {
  await actAs('worker1');
  await expectError(() => q(`select public.change_task_status($1, 'accepted')`, [T.w1Review]), /недоступен/);
  await expectError(() => q(`select public.change_task_status($1, 'rework', 'сам себе')`, [T.w1Review]), /недоступен/);
});

await test('не трогает принятую задачу', async () => {
  await actAs('worker1');
  await expectError(() => q(`select public.change_task_status($1, 'in_progress')`, [T.w1Accepted]), /недоступен/);
});

await test('Новая → В работе → На проверке: проходит, история пишется от его имени', async () => {
  await actAs('worker1');
  await q(`select public.change_task_status($1, 'in_progress')`, [T.w1New]);
  await q(`select public.change_task_status($1, 'review', 'Готово')`, [T.w1New]);
  assert((await taskRow(T.w1New)).status === 'review', 'статус не review');
  const { rows } = await q(
    'select from_status, to_status, changed_by, comment from public.task_history where task_id = $1 order by id',
    [T.w1New],
  );
  const last = rows.slice(-2);
  assert(rows.length === 3, `записей ${rows.length}, ожидалось 3`);
  assert(last[0].from_status === 'new' && last[0].to_status === 'in_progress', 'первая смена записана неверно');
  assert(last[1].to_status === 'review' && last[1].comment === 'Готово', 'вторая смена записана неверно');
  assert(last.every((r) => r.changed_by === users.worker1), 'автор смены не исполнитель');
});

await test('На доработке → В работе: проходит для назначенного исполнителя', async () => {
  await actAs('worker2');
  await q(`select public.change_task_status($1, 'in_progress')`, [T.w2Rework]);
  assert((await taskRow(T.w2Rework)).status === 'in_progress', 'статус не in_progress');
});

// ---------------------------------------------------------------------------
console.log('\nПостановщик');
// ---------------------------------------------------------------------------
await test('видит все объекты, задачи, историю и профили', async () => {
  await actAs('manager');
  const t = await q('select count(*)::int as n from public.tasks');
  const o = await q('select count(*)::int as n from public.objects');
  const p = await q('select count(*)::int as n from public.profiles');
  assert(t.rows[0].n === 7 && o.rows[0].n === 3 && p.rows[0].n === 4, 'видит не всё');
});

await test('второй постановщик тоже видит всё', async () => {
  await actAs('manager2');
  const t = await q('select count(*)::int as n from public.tasks');
  assert(t.rows[0].n === 7, 'видит не все задачи');
});

let createdTask;
let createdObject;
await test('создаёт объект и задачу: статус «Новая», автор он сам, в истории «— → Новая»', async () => {
  await actAs('manager');
  createdObject = (await q(`insert into public.objects (name, address) values ('Склад', 'ул. Тестовая, 1') returning id`)).rows[0].id;
  createdTask = (await q(
    `insert into public.tasks (title, description, object_id, assignee_id) values ('Тест', '', $1, $2) returning id, status, author_id`,
    [createdObject, users.worker2],
  )).rows[0];
  assert(createdTask.status === 'new' && createdTask.author_id === users.manager, JSON.stringify(createdTask));
  const { rows } = await q('select from_status, to_status, changed_by from public.task_history where task_id = $1', [createdTask.id]);
  assert(rows.length === 1 && rows[0].from_status === null && rows[0].to_status === 'new' && rows[0].changed_by === users.manager,
    JSON.stringify(rows));
});

await test('не может создать задачу сразу в другом статусе или от чужого имени', async () => {
  await actAs('manager');
  await expectError(
    () => q(`insert into public.tasks (title, object_id, assignee_id, status) values ('x', $1, $2, 'accepted')`, [createdObject, users.worker2]),
    DENIED,
  );
  await expectError(
    () => q(`insert into public.tasks (title, object_id, assignee_id, author_id) values ('x', $1, $2, $3)`,
      [createdObject, users.worker2, users.manager2]),
    DENIED,
  );
});

await test('исполнителем можно назначить только исполнителя', async () => {
  await actAs('manager');
  await expectError(
    () => q(`insert into public.tasks (title, object_id, assignee_id) values ('x', $1, $2)`, [createdObject, users.manager2]),
    /Исполнителем можно назначить/,
  );
  await expectError(() => q('update public.tasks set assignee_id = $2 where id = $1', [createdTask.id, users.manager]), /Исполнителем можно назначить/);
});

await test('редактирует и переназначает задачу', async () => {
  await actAs('manager');
  await q(`update public.tasks set title = 'Тест 2', assignee_id = $2 where id = $1`, [createdTask.id, users.worker1]);
  const row = await taskRow(createdTask.id);
  assert(row.title === 'Тест 2' && row.assignee_id === users.worker1, 'не изменилось');
});

await test('после переназначения прежний исполнитель задачу больше не видит', async () => {
  await actAs('worker2');
  const { rows } = await q('select id from public.tasks where id = $1', [createdTask.id]);
  assert(rows.length === 0, 'прежний исполнитель видит задачу');
});

await test('не делает переходы исполнителя (Новая → В работе)', async () => {
  await actAs('manager');
  await expectError(() => q(`select public.change_task_status($1, 'in_progress')`, [createdTask.id]), /недоступен/);
});

await test('не меняет статус прямым UPDATE', async () => {
  await actAs('manager');
  await expectError(() => q(`update public.tasks set status = 'accepted' where id = $1`, [T.w1Review]), DENIED);
});

await test('На проверке → На доработке без комментария: отклонено', async () => {
  await actAs('manager');
  await expectError(() => q(`select public.change_task_status($1, 'rework')`, [T.w1Review]), /комментарий обязателен/);
  await expectError(() => q(`select public.change_task_status($1, 'rework', '   ')`, [T.w1Review]), /комментарий обязателен/);
  assert((await taskRow(T.w1Review)).status === 'review', 'статус изменился');
});

await test('На проверке → На доработке с комментарием: проходит, комментарий в истории', async () => {
  await actAs('manager');
  await q(`select public.change_task_status($1, 'rework', 'Переделать узел')`, [T.w1Review]);
  const { rows } = await q('select to_status, comment, changed_by from public.task_history where task_id = $1 order by id desc limit 1', [T.w1Review]);
  assert(rows[0].to_status === 'rework' && rows[0].comment === 'Переделать узел' && rows[0].changed_by === users.manager,
    JSON.stringify(rows[0]));
});

await test('На проверке → Принята: проходит; после этого задача закрыта для правок', async () => {
  await actAs('manager');
  await q(`select public.change_task_status($1, 'accepted')`, [T.w1New]);
  assert((await taskRow(T.w1New)).status === 'accepted', 'не принята');
  await expectError(() => q(`update public.tasks set title = 'x' where id = $1`, [T.w1New]), /Принятую задачу нельзя/);
  await expectError(() => q(`select public.change_task_status($1, 'rework', 'ещё раз')`, [T.w1New]), /недоступен/);
});

await test('не подделывает и не удаляет историю', async () => {
  await actAs('manager');
  await expectError(
    () => q(`insert into public.task_history (task_id, to_status) values ($1, 'accepted')`, [T.w2New]),
    DENIED,
  );
  await expectError(() => q(`update public.task_history set comment = 'x'`), DENIED);
  await expectError(() => q(`delete from public.task_history`), DENIED);
});

await test('не меняет роли (ни свою, ни чужую)', async () => {
  await actAs('manager');
  await expectError(() => q(`update public.profiles set role = 'manager' where id = $1`, [users.worker2]), DENIED);
});

await test('объект с задачами удалить нельзя', async () => {
  await actAs('manager');
  await expectError(() => q('delete from public.objects where id = $1', [createdObject]), /23503|foreign key/);
});

await test('удаляет задачу (с её историей) и пустой объект', async () => {
  await actAs('manager');
  await q('delete from public.tasks where id = $1', [createdTask.id]);
  await q('delete from public.objects where id = $1', [createdObject]);
  const t = await admin('select count(*)::int as n from public.task_history where task_id = $1', [createdTask.id]);
  const o = await admin('select count(*)::int as n from public.objects where id = $1', [createdObject]);
  assert(t.rows[0].n === 0 && o.rows[0].n === 0, 'не удалено');
});

// ---------------------------------------------------------------------------
console.log(`\nИтого: ${passed} пройдено, ${failed} провалено`);
if (failed) {
  console.log('Провалены:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
await db.close();
