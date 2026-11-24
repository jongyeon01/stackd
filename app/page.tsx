import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Copy, PenLine, Search, Share2 } from "lucide-react";
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

const LIST_COLUMNS = "id, title, situation_short, steps, dev_stack, topic, author_handle";

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

      {/* EL-LAND-002·003 히어로 */}
      <section aria-labelledby="hero-title" className="overflow-hidden">
        <div className="container-page grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10">
          <div>
            {/* 3행 한 줄 유지: 모바일 vw 축소, 상한 48px */}
            <h1 id="hero-title" className="text-[min(3rem,8.5vw)] leading-[1.2] tracking-[-0.02em]">
              AI 도구는 많은데,
              <br />
              <span className="text-primary">어떻게 조합하고</span>
              <br />
              활용해야 할지 모르겠다면.
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-[1.75] text-muted-foreground">
              다른 개발자들은 어떤 도구를, 어떤 순서로 사용할까요? 실제 AI 워크플로우를 발견하고 내 작업 방식으로 만들어 보세요.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/workflows" className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base" })}>
                워크플로우 탐색하기 <ArrowUpRight aria-hidden />
              </Link>
              <Link href="/create" className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 px-6 text-base" })}>
                내 워크플로우 공유하기
              </Link>
            </div>
          </div>

          {/* 0번 카드 — 겹친 판 위에 살짝 기울여 "카드 묶음"으로 (시안 구성, 복제 링크는 2026-11-23 사용자 요청으로 제거) */}
          {/* lg mr: 6° 뒤판 돌출분(560×700 기준 35px×s)만큼 당겨 콘텐츠 끝선에 맞춤 */}
          <div aria-label="예시 워크플로우 카드" role="group" className="relative mx-auto [--s:0.56] sm:[--s:0.66] lg:[--s:0.7] lg:mr-[calc(35px*var(--s))]">
            <div aria-hidden className="absolute inset-x-0 top-0 h-[calc(700px*var(--s))] -rotate-6 rounded-xl border border-border bg-muted" />
            <div className="relative rotate-2 overflow-hidden rounded-xl shadow-[0_24px_48px_-24px_rgba(17,20,25,0.35)]">
              <div className="h-[calc(700px*var(--s))] w-[calc(560px*var(--s))] overflow-hidden">
                <div className="origin-top-left [transform:scale(var(--s))]">
                  <WorkflowCard workflow={HERO_CARD} handle="kjjyyy01" className="shadow-none" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EL-LAND-004·008 주제·검색 */}
      <section aria-labelledby="search-title" className="border-t border-border bg-card py-10 sm:py-12">
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
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
