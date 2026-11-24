-- Stackd 스키마 (v1 + 2.0 추가분 하단) — SSOT: docs/prd/05_데이터모델.md · 09_권한매트릭스.md
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run (1회, 재실행 안전)
-- 길이·개수 검증은 앱 레이어(제한 유틸, BR-007). DB CHECK는 방어용 최소만.

-- ─────────────────────────────────────────────
-- workflows — 카드 본문 (소유자 = auth.users)
-- ─────────────────────────────────────────────
create table if not exists public.workflows (
  id              text primary key
                  check (id ~ '^[0-9a-f]{8}$'),                 -- BR-023 16진 8자
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,                                 -- 1~30자 (BR-010)
  situation_short text not null,                                 -- 1~20자 (BR-011)
  situation       text,                                          -- 0~1000자 (BR-012)
  steps           jsonb not null
                  check (jsonb_typeof(steps) = 'array'
                     and jsonb_array_length(steps) between 2 and 8), -- BR-001 방어용
  dev_stack       jsonb not null default '[]'::jsonb,            -- 0~4 (BR-015)
  author_handle   text not null,                                 -- GitHub user_name 스냅샷
  author_avatar   text,                                          -- GitHub avatar_url 스냅샷
  role            text,                                          -- 0~20자 (BR-008)
  accent          text not null default 'ink',                   -- 액센트 슬러그
  is_public       boolean not null default true,                 -- BR-017
  hidden          boolean not null default false,                -- admin만 (BR-018)
  hidden_reason   text,                                          -- hidden=true면 필수 1~200자
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()             -- 서버 액션에서 갱신
);

-- 라이브러리 목록 / 내 카드 목록 인덱스
create index if not exists workflows_library_idx
  on public.workflows (is_public, hidden, created_at desc);
create index if not exists workflows_owner_idx
  on public.workflows (user_id, created_at desc);

-- ─────────────────────────────────────────────
-- feedback — 신고·문의 (service role만 접근)
-- ─────────────────────────────────────────────
create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('report', 'contact', 'feedback')),
  workflow_id text references public.workflows(id) on delete set null,
  body        text not null,                                     -- 1~500자 (BR-021)
  reporter_id uuid,                                              -- 세션 있으면 uid, 없으면 null
  resolved    boolean not null default false,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- RLS — PRD-09 권한 매트릭스와 1:1
-- ─────────────────────────────────────────────
alter table public.workflows enable row level security;

drop policy if exists "public read"  on public.workflows;
drop policy if exists "owner insert" on public.workflows;
drop policy if exists "owner update" on public.workflows;
drop policy if exists "owner delete" on public.workflows;

-- hidden 행도 읽힘 — 상세 페이지가 블러 + 사유를 렌더 (BR-018). 목록·OG는 앱에서 hidden=false 필터
create policy "public read"  on public.workflows
  for select using (is_public or auth.uid() = user_id);

create policy "owner insert" on public.workflows
  for insert with check (auth.uid() = user_id);

-- 소유자는 hidden·hidden_reason을 못 바꿈 (with check로 기존 값 고정) — admin 토글은 service role
create policy "owner update" on public.workflows
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and hidden = (select w.hidden from public.workflows w where w.id = workflows.id)
    and hidden_reason is not distinct from
        (select w.hidden_reason from public.workflows w where w.id = workflows.id)
  );

create policy "owner delete" on public.workflows
  for delete using (auth.uid() = user_id);

-- feedback: 정책 없음 = anon/authenticated 전면 차단, service role(서버 액션)만
alter table public.feedback enable row level security;

-- ═════════════════════════════════════════════
-- Stackd 2.0 (2026-11-23) — SSOT: docs/prd/05_데이터모델.md v3.0.0 · 09 v2.0.0
-- 추가 전용(기존 행·정책 의미 불변), 재실행 안전
-- ═════════════════════════════════════════════

-- 상세 템플릿·주제·복제 원본 컬럼 (BR-028·029·030) — 전부 nullable, 길이는 앱 레이어
alter table public.workflows add column if not exists topic           text;
alter table public.workflows add column if not exists expected_result text;  -- 0~300
alter table public.workflows add column if not exists prerequisites   text;  -- 0~500
alter table public.workflows add column if not exists caveats         text;  -- 0~500
alter table public.workflows add column if not exists tested_env      text;  -- 0~200, 작성자 자기 신고
alter table public.workflows add column if not exists prompt          text;  -- 0~2000, 워크플로우당 추천 프롬프트 1개 (2026-11-24)
alter table public.workflows add column if not exists forked_from     text
  references public.workflows(id) on delete set null;                    -- 2.0 판정 측정 대상

-- 주제 enum 방어용 CHECK (null = 기존 행)
alter table public.workflows drop constraint if exists workflows_topic_check;
alter table public.workflows add constraint workflows_topic_check
  check (topic is null or topic in ('build', 'review', 'test', 'debug', 'deploy', 'automation'));

-- 키워드 검색 대상 (BR-033) — 제목·상황·도구명, 앱은 쓰지 않는다
alter table public.workflows add column if not exists search_text text
  generated always as (
    lower(title || ' ' || situation_short || ' ' ||
          coalesce(jsonb_path_query_array(steps, '$[*].tool.name')::text, ''))
  ) stored;

-- 주제 필터 인덱스
create index if not exists workflows_topic_idx
  on public.workflows (topic, is_public, hidden, created_at desc);

-- 소유자 update가 forked_from(출처)을 못 바꾸도록 고정 (BR-030) — hidden 고정과 같은 방식
drop policy if exists "owner update" on public.workflows;
create policy "owner update" on public.workflows
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and hidden = (select w.hidden from public.workflows w where w.id = workflows.id)
    and hidden_reason is not distinct from
        (select w.hidden_reason from public.workflows w where w.id = workflows.id)
    and forked_from is not distinct from
        (select w.forked_from from public.workflows w where w.id = workflows.id)
  );

-- bookmarks — 저장 (BR-031)
create table if not exists public.bookmarks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  workflow_id text not null references public.workflows(id) on delete cascade,
  created_at  timestamptz not null default now(),                  -- 판정 측정 구간 필터
  primary key (user_id, workflow_id)
);
create index if not exists bookmarks_user_idx
  on public.bookmarks (user_id, created_at desc);

alter table public.bookmarks enable row level security;
drop policy if exists "own read"   on public.bookmarks;
drop policy if exists "own insert" on public.bookmarks;
drop policy if exists "own delete" on public.bookmarks;
create policy "own read"   on public.bookmarks for select using (auth.uid() = user_id);
-- 공개·비hidden 대상만 저장 가능 (update 정책 없음)
create policy "own insert" on public.bookmarks for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.workflows w
              where w.id = workflow_id and w.is_public and not w.hidden)
);
create policy "own delete" on public.bookmarks for delete using (auth.uid() = user_id);
