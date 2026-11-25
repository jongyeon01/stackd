import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ChevronDown, Copy, PenLine, Search, Share2 } from "lucide-react";
import DraftBanner from "@/components/draft-banner";
import JsonLd from "@/components/json-ld";
import { buttonVariants } from "@/components/ui/button";
import WorkflowCard from "@/components/workflow-card";
import WorkflowListCard from "@/components/workflow-list-card";
import { SearchForm, TopicChips } from "@/components/workflow-search";
import { HERO_CARD } from "@/lib/hero-card";
import { BASE_OG, SITE_NAME, SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

// SCR-009 랜딩 메타 (PRD-04 v3 `/` 행 — OQ-014 시안 그대로 확정)
const TITLE = "Stackd(스택드) — 개발자들의 AI 워크플로우 찾고 내 것으로 만들기";
const DESCRIPTION =
  "다른 개발자들은 어떤 AI 도구를 어떤 순서로 쓸까요? 실제 워크플로우를 찾아 저장하고, 내 방식으로 복제해 보세요.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { ...BASE_OG, title: TITLE, description: DESCRIPTION, url: "/" },
};

// role·accent는 히어로 좌우 WorkflowCard용
const LIST_COLUMNS = "id, title, situation_short, steps, dev_stack, topic, author_handle, role, accent";

// 사용 방법 4단계 (EL-LAND-006 · CPY-LAND-015~018) — 3번 "만들기"는 사용자 추가
const HOW = [
  { icon: Search, title: "01. 발견하기", body: "하고 싶은 작업을 주제로 찾고 다른 개발자들의 워크플로우를 살펴보세요." },
  { icon: Copy, title: "02. 내 방식으로 복제하기", body: "도구와 단계를 복제한 뒤 자신의 프로젝트와 환경에 맞게 수정하세요." },
  { icon: PenLine, title: "03. 내 워크플로우 만들기", body: "직접 쓰는 도구 조합과 순서를 단계별로 정리하세요." },
  { icon: Share2, title: "04. 공유하기", body: "정리한 워크플로우를 링크나 이미지 카드로 다른 개발자에게 공유하세요." },
];

const EYEBROW = "text-xs font-semibold uppercase tracking-[0.14em] text-primary";

// SCR-009 랜딩 — 탐색 중심 진입. 전부 서버 렌더, 클라이언트는 초안 배너뿐
export default async function Home({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  // 구 수정 링크 `/?edit=` → 빌더 분리 후 주소 (PRD-04 v3, 2.0)
  if (edit) redirect(`/create?edit=${encodeURIComponent(edit)}`);

  // 최신 6장 — 실패·0건이면 섹션 생략, 랜딩은 깨지지 않는다 (REQ-LAND-003 AC-3)
  const supabase = await createClient();
  const { data } = await supabase
    .from("workflows")
    .select(LIST_COLUMNS)
    .eq("is_public", true)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(6);
  const latest = data ?? [];
  // 히어로 좌우 2장 — 가운데 0번 카드와 같은 DB 사본은 제외 (0~2장)
  const side = latest.filter((w) => w.title !== HERO_CARD.title).slice(0, 2);

  return (
    <main className="flex-1">
      {/* 사이트 식별 + 사이트 내 검색(SearchAction) — 2.0부터 /workflows?q= 검색이 있다 */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          alternateName: "스택드", // 한글 브랜드 검색어 매칭 (SEO 9/8)
          url: SITE_URL,
          description: DESCRIPTION,
          inLanguage: "ko-KR",
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/workflows?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        }}
      />
      {/* 브랜드 주체 신호 — 로고는 PNG 규칙(180×180) */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: SITE_NAME,
          alternateName: "스택드",
          url: SITE_URL,
          logo: `${SITE_URL}/apple-icon.png`,
          sameAs: ["https://github.com/kjjyyy01/stackd", "https://www.threads.com/@kjjyyy_"],
        }}
      />
      {/* 초안 보유자는 빌더(`/create`)로 이어서 쓰기 (SCR-009 §11 #4) */}
      <DraftBanner href="/create" />

      {/* EL-LAND-002·003 히어로 — 가운데 정렬 텍스트 + 카드 3장 부채꼴 (2026-11-25 시안) */}
      <section aria-labelledby="hero-title" className="overflow-hidden">
        <div className="container-page pt-14 pb-6 sm:pt-20">
          <div className="text-center">
            {/* 2행 전체 액센트 — 좁은 화면은 keep-all로 어절 단위 줄바꿈 */}
            <h1 id="hero-title" className="text-[min(3.5rem,8.5vw)] leading-[1.2] tracking-[-0.02em]">
              AI 도구는 많은데,
              <br />
              <span className="text-primary">어떻게 조합하고 활용해야 할지 모르겠다면.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[46ch] text-lg leading-[1.75] text-muted-foreground">
              다른 개발자들은 어떤 도구를, 어떤 순서로 사용할까요? 실제 AI 워크플로우를 발견하고 내 작업 방식으로 만들어 보세요.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/workflows" className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base" })}>
                워크플로우 탐색하기 <ArrowUpRight aria-hidden />
              </Link>
              <Link href="/create" className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 px-6 text-base" })}>
                내 워크플로우 공유하기
              </Link>
            </div>
          </div>

          {/* 카드 무대 — 모바일(sm 미만)은 숨김, 좌우는 lg 이상. 좌우까지 콘텐츠 폭 안에 들어오게 배율을 잡는다 */}
          <div className="relative mt-14 hidden pb-[calc(48px*var(--s))] sm:block sm:[--s:0.66] lg:[--s:0.6] xl:[--s:0.7]">
            {side.map((w, i) => (
              // 좌우 = 최신 공개 카드 — 아래 목록과 같은 데이터라 장식 처리(링크·낭독 없음)
              <div
                key={w.id}
                aria-hidden
                className={`absolute top-[calc(56px*var(--s))] hidden lg:block ${
                  i === 0
                    ? "right-[calc(50%+190px*var(--s))] origin-bottom-right -rotate-[8deg]"
                    : "left-[calc(50%+190px*var(--s))] origin-bottom-left rotate-[8deg]"
                }`}
              >
                <div className="h-[calc(630px*var(--s))] w-[calc(504px*var(--s))] overflow-hidden rounded-xl">
                  <div className="origin-top-left [transform:scale(calc(var(--s)*0.9))]">
                    <WorkflowCard workflow={w} handle={w.author_handle} />
                  </div>
                </div>
              </div>
            ))}

            {/* 가운데 = 0번 카드 (복제 링크는 2026-11-23 사용자 요청으로 제거) */}
            <div
              aria-label="예시 워크플로우 카드"
              role="group"
              className="relative z-10 mx-auto h-[calc(700px*var(--s))] w-[calc(560px*var(--s))] overflow-hidden rounded-xl shadow-[0_24px_48px_-24px_rgba(17,20,25,0.35)]"
            >
              <div className="origin-top-left [transform:scale(var(--s))]">
                <WorkflowCard workflow={HERO_CARD} handle="kjjyyy01" className="shadow-none" />
              </div>
            </div>
          </div>

          {/* 아래 검색으로 내려가는 힌트 */}
          <a
            href="#search-title"
            aria-label="검색으로 이동"
            className="mx-auto mt-4 flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronDown aria-hidden className="size-6" />
          </a>
        </div>
      </section>

      {/* EL-LAND-004·008 주제·검색 */}
      <section aria-labelledby="search-title" className="bg-card py-10 sm:py-12">
        <div className="container-page grid gap-5">
          <h2 id="search-title" className="text-xl sm:text-2xl">지금 어떤 작업을 하고 있나요?</h2>
          <SearchForm />
          <TopicChips />
        </div>
      </section>

      {/* EL-LAND-005 최신 워크플로우 — 없으면 섹션 생략 */}
      {latest.length > 0 && (
        <section aria-labelledby="latest-title" className="border-t border-border py-14 sm:py-20">
          <div className="container-page">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className={EYEBROW}>Explore workflows</p>
                <h2 id="latest-title" className="mt-3 text-2xl sm:text-3xl">다른 개발자들은 이렇게 사용해요.</h2>
                <p className="mt-2 text-muted-foreground">실제 작업에 적용할 수 있는 도구 조합과 순서를 찾아보세요.</p>
              </div>
              <Link href="/workflows" className="inline-flex items-center gap-1 py-2 text-sm font-medium underline-offset-4 hover:underline">
                모든 워크플로우 <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </div>
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {latest.map((w, i) => (
                <li key={w.id}>
                  <WorkflowListCard w={w} index={i} headingAs="h3" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* EL-LAND-006 사용 방법 4단계 */}
      <section aria-labelledby="how-title" className="border-t border-border py-14 sm:py-20">
        <div className="container-page">
          <p className={EYEBROW}>How it works</p>
          <h2 id="how-title" className="mt-3 text-2xl sm:text-3xl">발견하고, 내 방식으로 바꾸고, 만들고, 공유하세요.</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {HOW.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4 lg:flex-col">
                <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-[1.75] text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* EL-LAND-007 마지막 CTA */}
      <section aria-labelledby="cta-title" className="border-t border-border bg-card py-16 sm:py-20">
        <div className="container-page grid justify-items-center gap-3 text-center">
          <h2 id="cta-title" className="text-2xl sm:text-3xl">당신의 작업 방식도 누군가에게 도움이 됩니다.</h2>
          <p className="text-muted-foreground">자신만의 AI 워크플로우를 카드 한 장으로 정리해 보세요.</p>
          <Link href="/create" className={buttonVariants({ size: "lg", className: "mt-5 h-12 px-6 text-base" })}>
            내 워크플로우 만들기 <ArrowUpRight aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
