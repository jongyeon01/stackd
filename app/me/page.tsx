import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import BookmarkRemove from "@/components/bookmark-remove";
import MyCardActions from "@/components/my-card-actions";
import WorkflowListCard, { type ListItem } from "@/components/workflow-list-card";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import CardTransition from "@/components/card-transition";
import WorkflowCard from "@/components/workflow-card";
import { createClient } from "@/lib/supabase/server";

// SCR-007 메타 — 개인 목록이라 색인 제외 (PRD-04)
export const metadata: Metadata = {
  title: "내 보관함",
  robots: { index: false, follow: false },
};

// 카드에 실리는 필드 + 목록 액션에 필요한 상태만
const LIST_COLUMNS =
  "id, title, situation_short, steps, dev_stack, role, accent, is_public, hidden, hidden_reason, forked_from";

// 저장 탭 — 대상은 RLS로 조인된다: 비공개·hidden이 된 타인 워크플로우는 null (BR-031)
const SAVED_COLUMNS = "workflow_id, workflows(id, title, situation_short, steps, dev_stack, topic, author_handle, is_public, hidden)";

// 탭 링크 (EL-ME-011) — 서버 렌더 링크라 JS 없이 전환
const TABS = [
  { key: "mine", label: "내 워크플로우", href: "/me" },
  { key: "saved", label: "저장한 워크플로우", href: "/me?tab=saved" },
] as const;

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "saved" ? "saved" : "mine"; // 그 외 값은 mine (REQ-ME-006 AC-2)
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  // 세션 확인 실패도 비인증으로 본다 — 재로그인이 복구 경로 (REQ-ME-001 AC-2·AC-3)
  if (!userId) redirect("/?auth=required");

  const handle = claims?.claims.user_metadata?.user_name as string | undefined;

  // RLS "public read"는 타인의 공개 카드도 통과시키므로 user_id 필터가 "내 것만"의 근거다
  // ponytail: 페이지네이션 없음 — 13장째부터 SCR-006 REQ-LIB-002의 ?page= 규칙을 적용한다
  if (tab === "saved") return <SavedTab userId={userId} />;

  const { data: rows, error } = await supabase
    .from("workflows")
    .select(LIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (
    <Shell tab="mine">

      {error ? (
        /* EL-ME-010 — h1 유지 + 재시도 (ERR-LIB-001 · CPY-LIB-002) */
        <div className="mt-16 grid justify-items-center gap-4 text-center">
          <p className="text-muted-foreground">목록을 불러오지 못했어요 — 다시 시도해주세요</p>
          <Link href="/me" className={buttonVariants({ variant: "outline" })}>
            다시 시도
          </Link>
        </div>
      ) : !rows?.length ? (
        /* EL-ME-009 Empty (CPY-ME-002 + CPY-HOME-006) */
        <div className="mt-16 grid justify-items-center gap-5 text-center">
          <p className="text-muted-foreground">아직 만든 워크플로우가 없어요 — 첫 워크플로우를 만들어보세요</p>
          <Link href="/create" className={buttonVariants({ size: "lg" })}>
            카드 만들기
          </Link>
        </div>
      ) : (
        /* EL-ME-003·004 — 최신순. 카드는 소유자라 비공개·hidden도 열린다 (PRD-09) */
        <ul className="mt-10 grid gap-8 md:grid-cols-2">
          {rows.map((w) => (
            <li key={w.id}>
              <Card className="gap-0 p-4 sm:p-5">
                <Link href={`/card-detail/${w.id}`}>
                  {/* 조판은 560×700 고정, 목록에서는 scale로만 축소 (DESIGN.md §카드 조판) */}
                  {/* 상세로 morph (ANIMATION.md #3) */}
                  <CardTransition id={w.id}>
                    <div className="mx-auto h-[calc(700px*var(--s))] w-[calc(560px*var(--s))] overflow-hidden [--s:0.55] sm:[--s:0.62] md:[--s:0.6]">
                      <div className="origin-top-left [transform:scale(var(--s))]">
                        <WorkflowCard workflow={w} handle={handle} />
                      </div>
                    </div>
                  </CardTransition>
                </Link>
                <h2 className="mt-4 text-lg font-semibold leading-[1.4]">
                  {w.title}
                  {/* EL-ME-014 복제본 배지 (CPY-ME-008) */}
                  {w.forked_from && <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 align-middle text-xs font-medium text-muted-foreground">복제</span>}
                </h2>
                <MyCardActions
                  id={w.id}
                  isPublic={w.is_public}
                  hidden={w.hidden}
                  hiddenReason={w.hidden_reason}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

// 공통 틀 — h1·설정 링크·탭 (EL-ME-001·002·011)
function Shell({ tab, children }: { tab: "mine" | "saved"; children: React.ReactNode }) {
  return (
    <main className="container-page flex-1 py-10 lg:py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        {/* EL-ME-001 페이지 유일 h1 (CPY-ME-001) */}
        <h1 className="text-2xl font-semibold tracking-[-0.015em] sm:text-3xl">내 보관함</h1>
        {/* EL-ME-002 — 헤더와 중복이나 로그아웃·탈퇴를 찾는 동선용 */}
        <Link href="/settings" className="py-2.5 text-sm leading-[1.75] text-muted-foreground underline underline-offset-4">
          설정
        </Link>
      </div>
      <nav aria-label="보관함" className="mt-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-3 text-sm font-medium ${t.key === tab ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}

// 저장 탭 (EL-ME-012·013, REQ-ME-006·007) — 저장 시각 최신순
async function SavedTab({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select(SAVED_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  // 임베드 관계는 1:1이지만 타입이 배열·객체 둘 다 될 수 있어 하나로 맞춘다
  const rows = (data ?? []).map((b) => ({ id: b.workflow_id, w: (Array.isArray(b.workflows) ? b.workflows[0] : b.workflows) as (ListItem & { is_public: boolean; hidden: boolean }) | null }));

  return (
    <Shell tab="saved">
      {error ? (
        <div className="mt-16 grid justify-items-center gap-4 text-center">
          <p className="text-muted-foreground">목록을 불러오지 못했어요 — 다시 시도해주세요</p>
          <Link href="/me?tab=saved" className={buttonVariants({ variant: "outline" })}>다시 시도</Link>
        </div>
      ) : !rows.length ? (
        /* 저장 Empty (CPY-ME-007) */
        <div className="mt-16 grid justify-items-center gap-5 text-center">
          <p className="text-muted-foreground">저장한 워크플로우가 없어요 — 탐색에서 마음에 드는 걸 저장해보세요</p>
          <Link href="/workflows" className={buttonVariants({ size: "lg" })}>워크플로우 탐색하기</Link>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ id, w }, i) => (
            <li key={id} className="grid gap-3">
              {/* 대상이 비공개·hidden이 됐으면 내용 대신 안내 (EL-ME-013 · CPY-ME-009) — 소유자 본인 것은 보이지만 저장 대상이 아니다 */}
              {w && w.is_public && !w.hidden ? (
                <WorkflowListCard w={w} index={i} />
              ) : (
                <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">지금은 볼 수 없는 워크플로우예요</p>
              )}
              <div className="justify-self-end">
                <BookmarkRemove id={id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
