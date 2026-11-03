# Мини-CRM «Объекты и задачи»

Постановщик ставит задачи по объектам (стройкам), исполнители берут их в работу и отдают на проверку. Каждая смена статуса сохраняется в историю.

Стек: React 19, TypeScript, Vite, Supabase (Postgres, Auth, RLS). Интерфейс на своём CSS, без UI-библиотеки.

- [EXPLAIN.md](EXPLAIN.md): как устроена система, объяснение для руководителя
- [DECISIONS.md](DECISIONS.md): решения и допущения, что не сделано

## Структура

```
supabase/migrations/   схема, функции и триггеры, RLS и права (применять по порядку имён)
supabase/seed.sql      роли тестовых пользователей и демо-данные
tests/security.test.mjs проверка правил доступа на настоящем Postgres
src/lib/               клиент Supabase, типы базы, запросы, таблица переходов
src/pages/             экраны: вход, объекты, карточка объекта, карточка задачи, «Мои задачи»
```

## Запуск

1. Создать проект в [Supabase](https://supabase.com) (бесплатного тарифа достаточно).
2. **SQL Editor**: выполнить по очереди три файла из `supabase/migrations/`. Либо через CLI: `npx supabase link --project-ref <ref>` и `npx supabase db push`.
3. **Authentication / Sign In / Providers**: выключить «Allow new users to sign up». Регистрация закрыта, пользователей создаёт только администратор.
4. **Authentication / Users / Add user / Create new user** (с галочкой «Auto Confirm User»):
   - `manager@example.com` постановщик
   - `worker1@example.com` исполнитель
   - `worker2@example.com` исполнитель
5. **SQL Editor**: выполнить `supabase/seed.sql`. Скрипт находит пользователей по email, назначает роли и создаёт 3 объекта и 7 задач во всех статусах с историей.
6. Скопировать `.env.example` в `.env` и вписать **Project URL** и **anon / publishable key** из Settings / API. Ключ `service_role` во фронтенд и в репозиторий не кладётся.
7. `npm install` и `npm run dev`.

Новый пользователь, добавленный через панель, всегда получает роль «Исполнитель». Сделать его постановщиком можно только запросом в SQL Editor:

```sql
update public.profiles set role = 'manager', full_name = 'Имя Фамилия' where email = 'user@example.com';
```

## Проверка безопасности

```
npm run test:db
```

Скрипт поднимает настоящий PostgreSQL (PGlite, Postgres в WebAssembly, ставится как зависимость, Docker не нужен), создаёт заглушку схемы `auth` как в Supabase (роли `anon` и `authenticated`, `auth.uid()` из JWT), выдаёт этим ролям права по умолчанию как в Supabase, применяет миграции и `seed.sql` без изменений. Затем от имени анонима, исполнителей и постановщиков отправляет запросы в обход интерфейса: чтение чужих задач, запрещённые переходы, правка названия и исполнителя, запись в историю, смена своей роли и т. д. Сейчас проходят все 46 проверок.

## Сборка и деплой

`npm run build` собирает статический сайт в `dist/`. Используется HashRouter, поэтому сайт работает на любом статическом хостинге без настройки перенаправлений.

- **GitHub Pages**: `./scripts/deploy-pages.sh` собирает сайт с переменными из `.env` и публикует `dist/` в ветку `gh-pages`. В Settings / Pages выбрать Source «Deploy from a branch», ветка `gh-pages`. Ключ service_role для сборки не нужен, только публичный anon-ключ.
- **Vercel / Netlify**: команда сборки `npm run build`, папка `dist`, те же две переменные окружения.
