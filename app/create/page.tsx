import type { Metadata } from "next";
import DraftBanner from "@/components/draft-banner";
import WorkflowBuilder from "@/components/workflow-builder";
import { EMPTY_DRAFT, type Draft } from "@/lib/draft";
import { BASE_OG } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

// SCR-001 만들기 메타 (PRD-04 `/create` 행) — 수정 모드는 noindex
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ edit?: string }> }): Promise<Metadata> {
  const { edit } = await searchParams;
  return {
    title: "워크플로우 만들기",
    description: "내 AI 워크플로우를 단계별로 정리해 카드 한 장으로 공유하세요.",
    alternates: { canonical: "/create" },
    openGraph: { ...BASE_OG, title: "워크플로우 만들기 | Stackd", url: "/create" },
    ...(edit ? { robots: { index: false } } : {}),
  };
}

// 빌더에 실을 필드만 — id·user_id·작성자 스냅샷은 저장 시 서버가 다시 채운다 (BR-025)
const EDIT_COLUMNS =
  "title, situation_short, situation, steps, dev_stack, role, accent, is_public, topic, expected_result, prerequisites, caveats, tested_env, forked_from";

// SCR-001 v4 — 빌더 전용 페이지 (2.0 랜딩 분리)
export default async function CreatePage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  // 수정 모드 (REQ-HOME-006) — 소유자 게이트는 user_id 명시 필터. 0행·에러·비로그인은 빈 빌더, 안내 없음
  let initial: Draft | undefined;
  let forked = false;
  if (edit && userId) {
    const { data: row } = await supabase
      .from("workflows")
      .select(EDIT_COLUMNS)
      .eq("id", edit)
      .eq("user_id", userId)
      .maybeSingle();
    if (row) {
      const { forked_from, ...fields } = row;
      forked = Boolean(forked_from); // 복제본 안내 (EL-HOME-033)
      // null 컬럼(기존 행의 2.0 필드)은 빈 값으로 — 초안·검증은 문자열을 기대한다
      initial = { ...EMPTY_DRAFT, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)), editId: edit };
    }
  }

  return (
    <main className="flex-1">
      {/* 수정 모드에서는 같은 카드의 초안일 때만 배너 (SCR-001 §11 #3) */}
      <DraftBanner editId={initial?.editId} />
      <section id="builder" className="scroll-mt-16 md:scroll-mt-18 py-12 sm:py-16">
        <div className="container-page">
          {/* 수정 모드는 헤딩부터 바꾼다 (CPY-HOME-058) — 2.0부터 페이지 유일 h1 (EL-HOME-024) */}
          <h1 className="text-2xl sm:text-3xl">{initial ? "워크플로우 수정하기" : "내 워크플로우 적기"}</h1>
          <p className="mt-3 max-w-[62ch] text-muted-foreground">
            카드 한 장까지 2분이면 충분해요. 저장할 때만 GitHub 로그인이 필요해요.
          </p>
          {forked && (
            <p role="status" className="mt-6 max-w-[62ch] rounded-lg border border-border bg-card px-4 py-3 text-sm">
              복제한 워크플로우예요 — 내 환경에 맞게 고친 뒤 저장하세요. 저장해도 공개는 직접 켜야 해요
            </p>
          )}
        </div>
        <WorkflowBuilder initial={initial} />
      </section>
    </main>
  );
}
