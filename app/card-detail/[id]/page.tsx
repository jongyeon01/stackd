import type { Metadata } from "next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";
import { cache } from "react";
import CardActions from "@/components/card-actions";
import FeedbackDialog from "@/components/feedback-dialog";
import JsonLd from "@/components/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import CardTransition from "@/components/card-transition";
import PromptCopy from "@/components/prompt-copy";
import WorkflowEngage from "@/components/workflow-engage";
import { Suspense } from "react";
import WorkflowCard from "@/components/workflow-card";
import type { WorkflowInput } from "@/lib/limits";
import { catalogSource } from "@/lib/catalog";
import { BASE_OG, SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

type Row = WorkflowInput & {
  id: string;
  user_id: string;
  author_handle: string;
  author_avatar: string | null;
  hidden: boolean;
  hidden_reason: string | null;
  created_at: string;
  updated_at: string;
  forked_from: string | null; // 2.0 복제 원본 (BR-030)
};

// id 형식이 어긋나면 조회 없이 없는 것으로 (BR-023·006)
// generateMetadata와 본문이 같은 요청에서 두 번 부른다 — 조회는 1회로 (React cache)
const getWorkflow = cache(async (id: string) => {
  if (!/^[0-9a-f]{8}$/.test(id)) return null;
  const supabase = await createClient();
  // RLS가 비공개 타인 행을 이미 걸러낸다 — 여기 null = 없음이거나 권한 없음 (BR-006)
  const { data } = await supabase.from("workflows").select("*").eq("id", id).maybeSingle();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims.sub;
  return data ? { wf: data as Row, uid, isOwner: uid === data.user_id } : null;
});

// 2.0 보조 조회 (PRD-06 §읽기 SCR-004) — 원본 표기 + 저장 여부. 실패는 미표시로 흡수
async function getEngageState(wf: Row, uid: string | undefined) {
  const supabase = await createClient();
  const [origin, saved] = await Promise.all([
    wf.forked_from
      ? supabase.from("workflows").select("id, title, author_handle").eq("id", wf.forked_from)
          .eq("is_public", true).eq("hidden", false).maybeSingle()
      : null,
    uid
      ? supabase.from("bookmarks").select("workflow_id").eq("user_id", uid).eq("workflow_id", wf.id).maybeSingle()
      : null,
  ]);
  return { origin: origin?.data ?? null, bookmarked: Boolean(saved?.data) };
}

// 상세 템플릿 섹션 (EL-WF-013) — 순서·제목은 CPY-WF-019~022
const DETAIL_SECTIONS = [
  { key: "expected_result", title: "예상 결과" },
  { key: "prerequisites", title: "준비물" },
] as const;
const DETAIL_SECTIONS_AFTER = [
  { key: "caveats", title: "주의사항" },
  { key: "tested_env", title: "작성자가 확인한 환경", note: "작성자 자기 신고" },
] as const;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const found = await getWorkflow(id);
  if (!found) return { title: "페이지를 찾을 수 없어요", robots: { index: false } };

  const { wf } = found;
  const title = `${wf.title} — @${wf.author_handle}`;
  // 도구 체인을 붙여 검색 스니펫에 실제 내용이 보이게 (SEO 점검 9/8 — 권장 70~160자)
  const chain = wf.steps.map((s) => s.tool.name).join(" → ");
  const description = `${wf.situation_short} · ${wf.steps.length}단계 워크플로우: ${chain}`.slice(0, 160);
  // 비공개·hidden은 색인·동적 OG 제외 (BR-017·018) — 기본 OG로 폴백
  const shareable = wf.is_public && !wf.hidden;

  return {
    title,
    description,
    alternates: { canonical: `/card-detail/${wf.id}` },
    robots: shareable ? undefined : { index: false, follow: false },
    openGraph: {
      ...BASE_OG, // 선언하면 상위 openGraph가 교체된다 — site_name·type·이미지 메타를 되깐다
      title,
      description,
      url: `/card-detail/${wf.id}`,
      // 공개만 동적 OG, v=는 updated_at epoch 캐시 버스팅 (PRD-06). 비공개·hidden은 정적 기본
      images: shareable
        ? [
            {
              ...BASE_OG.images[0], // 크기·타입은 동적 OG도 같은 1200×630 (PRD-06)
              url: `/api/og?id=${wf.id}&v=${Math.floor(new Date(wf.updated_at).getTime() / 1000)}`,
              alt: `${wf.title} 워크플로우 카드`,
            },
          ]
        : BASE_OG.images,
    },
  };
}

export default async function CardDetailPage({ params }: Params) {
  const { id } = await params;
  const found = await getWorkflow(id);
  if (!found) notFound(); // ERR-SHARE-001

  const { wf, isOwner, uid } = found;
  const links = toolLinks(wf.steps); // 카드·단계 목록 공용 (BR-027)
  const { origin, bookmarked } = await getEngageState(wf, uid);
  const canEngage = !isOwner && wf.is_public && !wf.hidden; // 복제·저장 노출 조건 (BR-030·031)

  // hidden은 404가 아니라 블러 — 타인에게는 내용을 렌더하지 않는다 (BR-018, EL-WF-011)
  if (wf.hidden && !isOwner) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <h1 className="text-2xl font-semibold tracking-[-0.015em]">숨겨진 워크플로우</h1>
        <div
          aria-hidden
          className="mt-8 h-[406px] w-[325px] rounded-xl border border-border bg-muted blur-sm"
        />
        <p className="mt-6 max-w-[62ch] text-sm leading-[1.75] text-muted-foreground">
          신고 검토로 숨겨진 워크플로우예요 — 사유: {wf.hidden_reason}
        </p>
        <Link href="/create?utm_source=card&utm_medium=share" className={`${buttonVariants({ size: "lg" })} mt-8 h-11 px-6`}>
          나도 내 워크플로우 카드 만들기
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      {/* 색인 대상일 때만 구조화 데이터 — noindex 카드에 내보내면 메타와 모순 (BR-017·018) */}
      {wf.is_public && !wf.hidden && (
        <>
          {/* 홈 › 라이브러리 › 카드 — Breadcrumb 리치결과 (SEO 점검 9/8) */}
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_URL}/` },
                { "@type": "ListItem", position: 2, name: "라이브러리", item: `${SITE_URL}/workflows` },
                { "@type": "ListItem", position: 3, name: wf.title },
              ],
            }}
          />
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Article",
            headline: wf.title,
            description: `${wf.situation_short} · ${wf.steps.length}단계 워크플로우: ${wf.steps.map((s) => s.tool.name).join(" → ")}`.slice(0, 160),
            url: `${SITE_URL}/card-detail/${wf.id}`,
            // JSON-LD는 metadataBase를 상속받지 않는다 — 절대 URL로 적는다
            image: `${SITE_URL}/api/og?id=${wf.id}&v=${Math.floor(new Date(wf.updated_at).getTime() / 1000)}`,
            datePublished: wf.created_at,
            dateModified: wf.updated_at,
            inLanguage: "ko-KR",
            author: {
              "@type": "Person",
              name: wf.author_handle,
              url: `https://github.com/${wf.author_handle}`,
            },
          }}
        />
        </>
      )}
      {/* EL-WF-012 가시 breadcrumb — BreadcrumbList 스키마와 같은 경로 (CPY-WF-018) */}
      <Breadcrumb aria-label="현재 위치" className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/">홈</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator>›</BreadcrumbSeparator>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/workflows">라이브러리</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator>›</BreadcrumbSeparator>
          <BreadcrumbItem><BreadcrumbPage className="max-w-[24ch] truncate">{wf.title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="lg:grid lg:grid-cols-[560px_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* EL-WF-001 요약 카드 — 유도 문구는 미노출(이미 상세다) */}
        <div className="[--s:0.58] sm:[--s:0.78] lg:[--s:1]">
          {/* 목록·미리보기에서 morph로 도착 (ANIMATION.md #3·#4) */}
          <CardTransition id={wf.id}>
            {/* mx-auto — 없으면 남는 폭이 전부 오른쪽에 몰린다 (/workflows와 동일) */}
            <div className="mx-auto h-[calc(700px*var(--s))] w-[calc(560px*var(--s))] overflow-hidden">
              <div className="origin-top-left [transform:scale(var(--s))]">
                <WorkflowCard id="wf-card" workflow={wf} handle={wf.author_handle} showDetailHint={false} titleAs="h1" toolLinks={links} />
              </div>
            </div>
          </CardTransition>
        </div>

        <div className="mt-8 lg:mt-0">
          {/* EL-WF-002 상태 배지 — 소유자에게만, hidden 우선 (BR-018) */}
          {isOwner && wf.hidden && (
            <Badge variant="destructive">
              이 카드는 신고 검토로 숨겨졌어요 — 사유: {wf.hidden_reason}. 문의는 하단 링크로
            </Badge>
          )}
          {isOwner && !wf.hidden && !wf.is_public && (
            <Badge variant="secondary">이 카드는 비공개예요 — 나만 볼 수 있어요</Badge>
          )}

          {/* EL-WF-005 작성자 — 이메일 미노출, GitHub 프로필로만 (BR-025) */}
          <div className="mt-6 flex items-center gap-3">
            {/* 이미지 없음·로드 실패 시 핸들 첫 글자 (shadcn Avatar) */}
            <Avatar size="lg">
              <AvatarImage src={wf.author_avatar ?? undefined} alt={`@${wf.author_handle} 프로필 이미지`} />
              <AvatarFallback className="font-mono">{wf.author_handle.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <a
              href={`https://github.com/${wf.author_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm underline underline-offset-4"
            >
              @{wf.author_handle}
            </a>
            {wf.role && <span className="text-sm text-muted-foreground">· {wf.role}</span>}
          </div>

          {/* EL-WF-012 원본 표기 — 복제본이면 항상, 지울 수 없다 (BR-030) */}
          {wf.forked_from && (
            <p className="mt-3 text-sm text-muted-foreground">
              {origin ? (
                <>원본: <Link href={`/card-detail/${origin.id}`} className="underline underline-offset-4">{origin.title} — @{origin.author_handle}</Link></>
              ) : (
                "원본을 볼 수 없어요"
              )}
            </p>
          )}

          {/* EL-WF-015·016 저장·복제 — 타인의 공개 워크플로우에만 (2.0 판정 측정 행동) */}
          {canEngage && (
            <Suspense>
              <WorkflowEngage id={wf.id} loggedIn={Boolean(uid)} bookmarked={bookmarked} />
            </Suspense>
          )}

          {/* EL-WF-006·009 공유·소유자 액션 (클라이언트) */}
          <CardActions id={wf.id} isOwner={isOwner} isPublic={wf.is_public} hidden={wf.hidden} />

          {/* EL-WF-007 CTA — 소유자는 UTM 없이(자기 유입은 확산이 아니다, PRD-15 §UTM) */}
          <Link
            href={isOwner ? "/create" : "/create?utm_source=card&utm_medium=share"}
            className={`${buttonVariants({ size: "lg" })} mt-8 h-11 w-full px-6 sm:w-auto`}
          >
            {isOwner ? "카드 하나 더 만들기" : "나도 내 워크플로우 카드 만들기"}
          </Link>

          {/* EL-WF-008 신고 — 푸터 문의와 같은 dialog, type만 report */}
          <div className="mt-6">
            <FeedbackDialog
              type="report"
              workflowId={wf.id}
              title="이 워크플로우 신고하기"
              description="문제가 되는 부분을 알려주시면 확인 후 조치할게요."
              trigger={
                <Button variant="link" className="h-auto px-0 py-2.5 font-normal text-muted-foreground underline">
                  이 워크플로우 신고하기
                </Button>
              }
            />
          </div>
        </div>
      </div>

      {/* EL-WF-003 상황 상세 — 비어 있으면 섹션 생략 (BR-012) */}
      {wf.situation && (
        <section className="mt-14">
          <h2 className="text-lg font-semibold tracking-[-0.015em]">상황</h2>
          <p className="mt-3 max-w-[62ch] whitespace-pre-wrap text-base leading-[1.75]">{wf.situation}</p>
        </section>
      )}

      <DetailSections wf={wf} sections={DETAIL_SECTIONS} />

      {/* EL-WF-014 추천 프롬프트 — 워크플로우당 1개, 단계 흐름을 한 번에 실행하는 지시. 복사만 (BR-032) */}
      {wf.prompt && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-[-0.015em]">추천 프롬프트</h2>
          <div className="mt-3 max-w-[62ch] rounded-lg border border-border bg-muted/50">
            <pre id="wf-prompt" className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-[1.75]">{wf.prompt}</pre>
            <div className="flex justify-end border-t border-border px-2 py-1.5">
              <PromptCopy id={wf.id} text={wf.prompt} />
            </div>
          </div>
        </section>
      )}

      {/* EL-WF-004 단계별 설명 — 카드에서 잘린 메모 전문이 여기 있다 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-[-0.015em]">단계별 설명</h2>
        <ol className="mt-4 space-y-8">
          {wf.steps.map((s, i) => (
            <li key={`${s.tool.name}-${i}`} className="max-w-[62ch]">
              <p className="font-mono text-sm font-medium">
                {String(i + 1).padStart(2, "0")} <StepToolName name={s.tool.name} link={links[i]} />
                {s.tool.custom && (
                  <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 align-middle font-mono text-xs font-medium text-muted-foreground">
                    custom
                  </span>
                )}
                <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{s.tool.category}</span>
              </p>
              <p className="mt-1 text-base leading-[1.75]">{s.note}</p>
              {s.detail && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-[1.75] text-muted-foreground">{s.detail}</p>
              )}
            </li>
          ))}
        </ol>
        {wf.steps.some((s) => s.tool.custom) && (
          <p className="mt-6 text-sm leading-[1.75] text-muted-foreground" style={{ wordBreak: "keep-all" }}>
            custom 표시가 붙은 도구는 공개돼 있지 않아 그대로 가져다 쓸 수 없어요.
          </p>
        )}
      </section>

      <DetailSections wf={wf} sections={DETAIL_SECTIONS_AFTER} />
    </main>
  );
}

// 상세 템플릿 섹션 — 값 있는 것만 (BR-028). 비어 있는 기존 카드는 1.0과 같은 화면 (REQ-WF-011 AC-2)
function DetailSections({ wf, sections }: { wf: Row; sections: readonly { key: keyof Row; title: string; note?: string }[] }) {
  return sections.map(({ key, title, note }) =>
    wf[key] ? (
      <section key={key} className="mt-12">
        <h2 className="text-lg font-semibold tracking-[-0.015em]">
          {title}
          {note && <span className="ml-2 text-xs font-normal text-muted-foreground">· {note}</span>}
        </h2>
        <p className="mt-3 max-w-[62ch] whitespace-pre-wrap text-base leading-[1.75]">{String(wf[key])}</p>
      </section>
    ) : null,
  );
}


// 카드 도구명 링크 (BR-027) — 카탈로그 출처 → 작성자 등록 URL → 없음
function toolLinks(steps: WorkflowInput["steps"]) {
  return steps.map(({ tool }) => {
    const source = catalogSource(tool.name);
    if (source) return { href: source, ugc: false };
    return tool.url ? { href: tool.url, ugc: true } : null;
  });
}

// 단계 목록 도구명 — 링크 있으면 새 탭 (BR-027)
function StepToolName({ name, link }: { name: string; link: ReturnType<typeof toolLinks>[number] }) {
  if (!link) return <>{name}</>;
  return (
    <a
      href={link.href}
      target="_blank"
      // 작성자 등록 링크는 사용자 생성 콘텐츠 — 검색엔진 신뢰 전달 차단
      rel={link.ugc ? "nofollow ugc noopener noreferrer" : "noopener noreferrer"}
      className="inline-flex items-center gap-0.5 underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground"
    >
      {name}
      <ArrowUpRight aria-hidden className="size-3.5" />
      <span className="sr-only">(새 탭)</span>
    </a>
  );
}
