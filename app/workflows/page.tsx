import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import GridStagger from "@/components/grid-stagger";
import JsonLd from "@/components/json-ld";
import WorkflowListCard from "@/components/workflow-list-card";
import { SearchForm, TopicChips } from "@/components/workflow-search";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { TOPIC_LABELS, likePattern, normalizeQuery, parseTopic } from "@/lib/limits";
import { libraryHref, pageCount, pageRange, pageWindow, parsePage } from "@/lib/paginate";
import { BASE_OG, SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

// SCR-006 메타 — 색인 대상. ?page≥2도 canonical은 /workflows (첫 페이지만 색인, §13)
// 메타와 리드 문단이 같은 문장 (CPY-LIB-007) — 스니펫과 본문이 어긋나지 않게
const LIB_DESCRIPTION =
  "개발자들이 실제로 쓰는 AI 워크플로우 카드 모음 — 상황·단계·도구를 한 장으로 보고 내 것도 만들어보세요.";

export const metadata: Metadata = {
  title: "라이브러리",
  description: LIB_DESCRIPTION,
  alternates: { canonical: "/workflows" },
  openGraph: { ...BASE_OG, url: "/workflows" }, // BASE_OG 없으면 site_name·type·이미지 메타가 사라진다
};

// 목록 카드에 실리는 필드 (2.0 목록 카드). situation(본문)은 목록에서 쓰지 않는다 (§8)
const LIST_COLUMNS = "id, title, situation_short, steps, dev_stack, topic, author_handle, author_avatar";

type SP = { page?: string; topic?: string; q?: string };

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const topic = parseTopic(sp.topic); // enum 밖은 무시 = 전체 (BR-029)
  const q = normalizeQuery(sp.q); // trim·50자 (BR-033)
  const { from, to } = pageRange(page);
  const href = (p: number) => libraryHref({ topic, q, page: p });

  const supabase = await createClient();
  // 공개·비hidden + 주제·검색 필터 — count와 목록이 같은 조건이어야 페이지 수가 맞는다
  // match()에 undefined 키를 넣지 않으려고 객체를 조건부로 만든다
  const eqs = { is_public: true, hidden: false, ...(topic ? { topic } : {}) };
  const pattern = q ? likePattern(q) : "%"; // 검색 없음 = 전부 일치
  // 명시 필터 필수 — 로그인 세션의 RLS는 본인 비공개 행을 통과시킨다 (§9)
  // count는 별도 head 쿼리로 먼저 받는다 — PostgREST는 range(from,to)의 from이 총 개수를
  // 넘으면 count: "exact"와 함께 쓸 때 416(PGRST103)을 던진다(실측: from=7·total=6 재현).
  // 그래서 유효 페이지인지 먼저 이걸로 판정한 뒤에만 메인 쿼리를 range와 함께 실행한다
  // count 쿼리 실패 시 count는 null → totalPages는 1이 되어 아래 조건이 그대로 걸러준다
  const { count } = await supabase.from("workflows").select("id", { count: "exact", head: true }).match(eqs).ilike("search_text", pattern);

  const totalPages = pageCount(count ?? 0);
  // 총 페이지 수를 넘는 page 요청 = 범위 초과 — Empty 문구 오노출 방지 (REQ-LIB-002 AC-2)
  if (page > totalPages) redirect(libraryHref({ topic, q }));

  const { data: rows, error } = await supabase.from("workflows").select(LIST_COLUMNS).match(eqs).ilike("search_text", pattern)
    .order("created_at", { ascending: false })
    .range(from, to);

  const items = rows ?? [];

  return (
    <main className="container-page flex-1 py-10 lg:py-14">
      {/* EL-LIB-001 페이지 유일 h1 (CPY-LIB-001) — 오류 상태에서도 유지된다 */}
      <h1 className="text-2xl font-semibold tracking-[-0.015em] sm:text-3xl">
        개발자들의 워크플로우
      </h1>
      {/* EL-LIB-007 리드 문단 — 목록 페이지의 유일한 본문 텍스트 (SEO 점검 9/8) */}
      <p className="mt-3 max-w-[62ch] leading-[1.75] text-muted-foreground">{LIB_DESCRIPTION}</p>

      {/* EL-LIB-008 검색 + EL-LIB-007 주제 칩 (2.0) */}
      <div className="mt-8 grid max-w-3xl gap-4">
        <SearchForm q={q} topic={topic} />
        <TopicChips current={topic} q={q} />
      </div>
      {q && (
        <p className="mt-6 text-sm text-muted-foreground">
          &apos;{q}&apos; 검색 결과 {count ?? 0}개{topic && ` · ${TOPIC_LABELS[topic]}`}
          <Link href={libraryHref({ topic })} className="ml-3 underline underline-offset-4">검색 지우기</Link>
        </p>
      )}

      {error ? (
        /* EL-LIB-006 (CPY-LIB-002 · ERR-LIB-001) — 재시도는 같은 URL 재요청 */
        <div className="mt-16 grid justify-items-center gap-4 text-center">
          <p className="text-muted-foreground">목록을 불러오지 못했어요 — 다시 시도해주세요</p>
          <Link href={href(page)} className={buttonVariants({ variant: "outline" })}>
            다시 시도
          </Link>
        </div>
      ) : !items.length && (q || topic) ? (
        /* 필터 결과 0건 (CPY-LIB-011 · CPY-LIB-008) — 에러 아님 */
        <div className="mt-16 grid justify-items-center gap-5 text-center">
          <p className="text-muted-foreground">
            {q ? "검색 결과가 없어요 — 다른 단어로 찾거나 주제로 둘러보세요" : "이 주제의 워크플로우가 아직 없어요 — 전체를 둘러보거나 직접 만들어보세요"}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/workflows" className={buttonVariants({ variant: "outline" })}>전체 보기</Link>
            <Link href="/create" className={buttonVariants()}>직접 만들기</Link>
          </div>
        </div>
      ) : !items.length ? (
        /* EL-LIB-005 Empty (CPY-LIB-003 + CPY-HOME-006) */
        <div className="mt-16 grid justify-items-center gap-5 text-center">
          <p className="text-muted-foreground">
            아직 공개된 워크플로우가 없어요 — 첫 카드를 만들어보세요
          </p>
          <Link href="/create" className={buttonVariants({ size: "lg" })}>
            카드 만들기
          </Link>
        </div>
      ) : (
        <>
          {/* 갤러리 목록 구조화 데이터 — position은 페이지 오프셋 반영 (SEO 점검 9/8) */}
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "ItemList",
              itemListElement: items.map((w, i) => ({
                "@type": "ListItem",
                position: from + i + 1,
                name: w.title,
                url: `${SITE_URL}/card-detail/${w.id}`,
              })),
            }}
          />
          {/* EL-LIB-002 목록 — 1열 / sm 2열 / lg 3열 (§16) · 진입 stagger는 ANIMATION.md #5 */}
          <GridStagger className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((w, i) => (
              <li key={w.id}>
                {/* EL-LIB-003 목록 카드 (2.0) — 항목 전체가 링크 1개, 순번은 페이지 오프셋 반영 */}
                <WorkflowListCard w={w} index={from + i} />
              </li>
            ))}
          </GridStagger>

          {/* EL-LIB-004 페이지네이션 (CPY-LIB-005·006) — 전부 <a href> 실링크, JS 없이 동작.
              size-8/9(32~36px)만으론 §15 터치 타깃 44×44에 못 미쳐 min-h-11 min-w-11로 보정 */}
          {totalPages > 1 && (
            <Pagination className="mt-12">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    text="이전"
                    href={page > 1 ? href(page - 1) : undefined}
                    aria-disabled={page <= 1}
                    className={`min-h-11 min-w-11 ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
                  />
                </PaginationItem>
                {pageWindow(page, totalPages).map((p, i) =>
                  p === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href={href(p)}
                        isActive={p === page}
                        className="min-h-11 min-w-11"
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    text="다음"
                    href={page < totalPages ? href(page + 1) : undefined}
                    aria-disabled={page >= totalPages}
                    className={`min-h-11 min-w-11 ${page >= totalPages ? "pointer-events-none opacity-50" : ""}`}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}
    </main>
  );
}
