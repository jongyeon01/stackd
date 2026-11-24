import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIMITS, TOPICS, TOPIC_LABELS, type Topic } from "@/lib/limits";
import { libraryHref } from "@/lib/paginate";

// 검색 폼 (EL-LAND-008·EL-LIB-008) — 네이티브 GET이라 JS 없이 /workflows?q= 로 간다 (BR-033)
export function SearchForm({ q = "", topic = null }: { q?: string; topic?: Topic | null }) {
  return (
    <form method="get" action="/workflows" role="search" className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={LIMITS.search_q.max}
          placeholder="예: SaaS MVP 개발, 코드 리뷰 자동화, 디버깅…"
          aria-label="워크플로우 검색"
          className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </div>
      {/* 주제 필터 중이면 검색해도 유지 (REQ-LIB-004 AC-1 — AND) */}
      {topic && <input type="hidden" name="topic" value={topic} />}
      <Button type="submit" className="h-11 px-5">검색</Button>
    </form>
  );
}

// 주제 칩 (EL-LAND-004·EL-LIB-007) — 링크라 필터 상태를 클라이언트가 갖지 않는다 (BR-029)
export function TopicChips({ current = null, q = "" }: { current?: Topic | null; q?: string }) {
  const chips: [Topic | null, string][] = [[null, "전체"], ...TOPICS.map((t) => [t, TOPIC_LABELS[t]] as [Topic, string])];
  return (
    <nav aria-label="주제" className="flex flex-wrap gap-2">
      {chips.map(([t, label]) => {
        const active = t === current;
        return (
          <Link
            key={label}
            href={libraryHref({ topic: t, q })}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
              active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
