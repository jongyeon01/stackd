import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TOPIC_LABELS, parseTopic, type WorkflowInput } from "@/lib/limits";

// 목록 카드에 필요한 필드만 — 공유용 WorkflowCard(560×700)와 별개 (PRD-00 §용어 "목록 카드")
export type ListItem = Pick<WorkflowInput, "title" | "situation_short" | "steps" | "dev_stack"> & {
  id: string;
  topic: string | null;
  author_handle: string;
};

const MAX_TOOLS = 4; // 도구 흐름은 4개까지, 나머지는 "외 n"

// 목록 카드 (SCR-006 EL-LIB-003 · SCR-009 EL-LAND-005 공용) — 카드 전체가 링크 1개
export default function WorkflowListCard({ w, headingAs: H = "h2" }: { w: ListItem; headingAs?: "h2" | "h3" }) {
  const topic = parseTopic(w.topic);
  const tools = w.steps.map((s) => s.tool.name);
  return (
    <Link
      href={`/card-detail/${w.id}`}
      className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {/* 주제는 액센트 — 카드가 흑백 텍스트만 남지 않게 (2026-11-25 사용자 결정) */}
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-primary">{topic && TOPIC_LABELS[topic]}</span>
        <span className="text-muted-foreground">{w.steps.length}단계</span>
      </div>
      <H className="mt-3 text-lg font-semibold leading-[1.4] text-balance">{w.title}</H>
      <p className="mt-1.5 text-sm text-muted-foreground">{w.situation_short}</p>

      {/* 도구 흐름 = 가로 미니 레일 — 점 노드를 헤어라인으로 잇는다 (DESIGN.md §시그니처) */}
      <ol aria-label="사용 도구 순서" className="mb-5 mt-4 flex flex-wrap items-center gap-y-2">
        {tools.slice(0, MAX_TOOLS).map((name, i) => (
          <li key={`${name}-${i}`} className="flex items-center">
            {i > 0 && <span aria-hidden className="mx-1.5 h-px w-3 bg-foreground/30" />}
            <span aria-hidden className="mr-1.5 size-1.5 shrink-0 rounded-full bg-foreground" />
            <span className="font-mono text-xs">{name}</span>
          </li>
        ))}
        {tools.length > MAX_TOOLS && <li className="ml-2 text-xs text-muted-foreground">외 {tools.length - MAX_TOOLS}</li>}
      </ol>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">
          {w.dev_stack.length ? w.dev_stack.map((t) => t.name).join(" · ") : `@${w.author_handle}`}
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-medium">
          자세히 보기 <ArrowUpRight aria-hidden className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}
