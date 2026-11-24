"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ToolPicker from "@/components/tool-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { DRAFT_EVENT } from "@/components/draft-banner";
import { track } from "@/lib/analytics";
import { isCatalogTool } from "@/lib/catalog";
import { EMPTY_DRAFT, clearDraft, isDraftEmpty, isResuming, loadDraft, saveDraft, type Draft } from "@/lib/draft";
import { CATEGORIES, CUSTOMIZABLE_CATEGORIES, DETAIL_FIELDS, DEV_STACK_CATEGORIES, LIMITS, TOPICS, TOPIC_LABELS, charCount, toolUrl, validateWorkflow } from "@/lib/limits";

type Step = Draft["steps"][number];

// 상세 템플릿 입력 라벨 (CPY-HOME-066~069) — rows 없으면 한 줄 입력
const DETAIL_UI: { key: (typeof DETAIL_FIELDS)[number]; label: string; rows?: number }[] = [
  { key: "expected_result", label: "예상 결과 — 이 워크플로우를 적용하면 무엇을 얻나요?", rows: 2 },
  { key: "prerequisites", label: "준비물 — 필요한 계정·도구·프로젝트 환경", rows: 3 },
  { key: "caveats", label: "주의사항 — 보안·호환성·API 비용·라이선스 등", rows: 3 },
  { key: "tested_env", label: "직접 확인한 환경 — 예: macOS · Next.js 16 · Claude Code 2.x (상세에 '작성자 자기 신고'로 표시)" },
];
type Props = {
  initial?: Draft; // 수정 모드로 로드된 DB 값 (REQ-HOME-006) — 없으면 새로 쓰기
};

// 글자 수 카운터 — 상한 도달·초과 시 붉게 (ERR-BLDR-005 "카운터 붉게")
function Counter({ n, max, over }: { n: number; max: number; over?: boolean }) {
  return (
    <span className={`font-mono text-xs ${over || n >= max ? "text-destructive" : "text-muted-foreground"}`}>
      {n}/{max}{over && " · 글자 수를 넘었어요"}
    </span>
  );
}

// SCR-001 빌더 — 상태는 여기 한 곳, 변경마다 초안 저장 (BR-019). 서버 쓰기 없음
export default function WorkflowBuilder({ initial }: Props) {
  const [d, setD] = useState<Draft>(initial ?? { ...EMPTY_DRAFT });
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null); // 직전 입력이 상한에 막힌 필드
  const [picking, setPicking] = useState(false); // 단계 도구 선택기 열림
  const [ctaTried, setCtaTried] = useState(false);
  const hydrated = useRef(false);
  const pending = useRef<Draft | null>(null); // 배너(전역) 응답 대기 중인 초안
  const initialRef = useRef(initial); // 서버 prop — 마운트 시점 값만 쓴다
  const firedTools = useRef(new Set<string>()); // step_add 발화 이력 (재추가 억제)

  // 진입 시 초안 확인 + 배너(DraftBanner) 신호 수신 — 배너 UI는 전역 위치가 소유 (EL-HOME-004)
  useEffect(() => {
    const init = initialRef.current;
    const saved = loadDraft();
    const resuming = isResuming(); // 배너와 공유되는 모듈 캐시 — 누가 먼저 묻든 같은 답

    if (init && saved && saved.editId !== init.editId) {
      clearDraft(); // 다른 카드의 초안 — 수정은 명시적 행위라 안내 없이 폐기 (SCR-001 §11 #3)
    } else if (saved && !isDraftEmpty(saved)) {
      if (resuming) {
        // `/card` 복귀 = 방금 쓴 내용이라 되묻지 않는다 (§6 뒤로가기). 수정 흐름도 이어간다
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 마운트 후 1회만 읽는다
        setD(saved);
      } else if (!init && saved.editId) {
        // 수정 모드가 아닌데 초안에 editId가 남아 있다 — 떼어낸다. 남겨두면 그 카드를
        // 삭제한 뒤에도 새로 쓴 초안이 계속 그 id로 update를 시도한다 (8/27 사용자 보고).
        // `init`이 있을 때(= 같은 카드를 수정 중)는 유지해야 한다 — 떼면 이어서 쓰기가 복제본을 만든다
        const fresh = { ...saved, editId: undefined };
        saveDraft(fresh); // 배너에 답하지 않고 떠나도 저장소에 남지 않게
        pending.current = fresh;
      } else {
        pending.current = saved; // 배너 응답을 기다린다 (§11 #3·#4)
      }
    }
    // 수정 대상(엣지 14)·방금 쓰던 내용(§6 복귀) 앞으로 데려간다 — 빌더가 하단이라 없으면 다시 스크롤해야 한다
    if (init || resuming) document.getElementById("builder")?.scrollIntoView();
    hydrated.current = true;

    const onDraft = (e: Event) => {
      // 수정 모드의 "새로 시작" = DB 값 복귀 — d가 이미 initial이라 보류 해제만으로 충족된다
      if ((e as CustomEvent).detail === "restore" && pending.current) setD(pending.current);
      pending.current = null; // discard든 restore든 저장 보류 해제
    };
    window.addEventListener(DRAFT_EVENT, onDraft);
    return () => window.removeEventListener(DRAFT_EVENT, onDraft);
  }, []);

  // 상태 변경마다 저장 — 단, 빈 빌더를 덮어써서 배너 대상 초안을 지우면 안 된다.
  // 수정 모드의 초기값도 저장한다: `/card`는 초안을 유일한 전달 통로로 쓰므로(BR-019)
  // 아무것도 고치지 않고 미리보기로 넘어가면 초안이 없어 홈으로 튕긴다 (8/27 점검)
  useEffect(() => {
    if (!hydrated.current || pending.current) return;
    if (isDraftEmpty(d)) return;
    saveDraft(d);
  }, [d]);

  // 이동처는 `/card`로 같지만 "만들기"는 새로 만드는 것으로 읽힌다 (CPY-HOME-006 / 059)
  const ctaLabel = initial ? "수정한 내용 확인하기" : "카드 만들기";
  const gateOk = validateWorkflow(d).ok; // BR-016 = 전체 검증 통과 (서버 재검증과 같은 함수)
  // 인라인 에러는 필드별로 — 첫 위반만 돌려주는 검증 결과에 기대면 둘 다 비었을 때 하나만 보인다
  const fieldOk: Record<string, boolean> = {
    title: charCount(d.title.trim()) >= LIMITS.title.min,
    situation_short: charCount(d.situation_short.trim()) >= LIMITS.situation_short.min,
    topic: d.topic !== "",
  };

  // 상한 넘는 입력은 차단(값 미반영) + 해당 필드 카운터 옆 안내
  function limited(field: string, max: number, apply: (s: string) => void) {
    return (s: string) => {
      if (charCount(s) > max) return setOver(field);
      setOver(null);
      apply(s);
    };
  }
  const touch = (f: string) => setTouched((t) => new Set(t).add(f));
  const showErr = (f: string) => (touched.has(f) || ctaTried) && !fieldOk[f];

  // 단계 조작 (REQ-HOME-002·003)
  function addStep(tool: Step["tool"], method: "catalog" | "manual") {
    if (d.steps.length >= LIMITS.steps.max) return;
    setD({ ...d, steps: [...d.steps, { tool, note: "", detail: "" }] });
    // EVT-BLDR-001 — 삭제 후 재추가는 미발화, 도구 인기 과대계상 방지 (PRD-15)
    if (!firedTools.current.has(tool.name)) {
      firedTools.current.add(tool.name);
      track("step_add", { method, item_category: tool.category, item_name: tool.name });
    }
    setPicking(false);
  }
  const patchStep = (i: number, p: Partial<Step>) => setD({ ...d, steps: d.steps.map((s, k) => (k === i ? { ...s, ...p } : s)) });

  // 카탈로그에 없고 skill 계열일 때만 custom 토글을 띄운다 (BR-026·EL-HOME-025)
  const canMarkCustom = (t: Step["tool"]) =>
    !isCatalogTool(t.name) && (CUSTOMIZABLE_CATEGORIES as readonly string[]).includes(t.category);
  const moveStep = (i: number, dir: -1 | 1) => {
    const s = [...d.steps]; const j = i + dir;
    [s[i], s[j]] = [s[j], s[i]];
    setD({ ...d, steps: s });
  };
  const removeStep = (i: number) => setD({ ...d, steps: d.steps.filter((_, k) => k !== i) });

  // 스택 태그 (REQ-HOME-004) — 중복은 trim 정확 일치로 차단, 이벤트 없음
  function addTag(t: Draft["dev_stack"][number]) {
    if (d.dev_stack.length >= LIMITS.dev_stack.max) return;
    if (d.dev_stack.some((x) => x.name.trim() === t.name.trim())) return;
    setD({ ...d, dev_stack: [...d.dev_stack, t] });
  }

  // 링크 형식 위반 — blur 뒤나 CTA 시도 뒤에만 노출
  const urlErr = (i: number, s: Step) => (touched.has(`url-${i}`) || ctaTried) && toolUrl(s.tool.url) === null;

  const stepIncomplete = (s: Step) => !s.note.trim() || !s.detail.trim();

  return (
    <div className="container-page">
      <form className="mt-10 grid max-w-2xl gap-10" onSubmit={(e) => e.preventDefault()} noValidate>
        {/* 기본 정보 (EL-HOME-005~007) */}
        <fieldset className="grid gap-6">
          <legend className="sr-only">기본 정보</legend>
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <Label htmlFor="title" className="text-sm font-medium">제목 — 이 워크플로우를 한 줄로</Label>
              <Counter n={charCount(d.title)} max={LIMITS.title.max} over={over === "title"} />
            </div>
            <Input id="title" value={d.title} onChange={(e) => limited("title", LIMITS.title.max, (s) => setD({ ...d, title: s }))(e.target.value)}
              onBlur={() => touch("title")} placeholder="제목 — 이 워크플로우를 한 줄로" aria-invalid={showErr("title") || undefined} aria-describedby="title-err" />
            {/* 문구 자리 상시 확보 — blur 때 레이아웃 밀림 방지 */}
            <p id="title-err" className="min-h-4 text-xs text-destructive">{showErr("title") ? "제목을 1~30자로 입력해주세요" : null}</p>
          </div>
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <Label htmlFor="situation_short" className="text-sm font-medium">상황</Label>
              <Counter n={charCount(d.situation_short)} max={LIMITS.situation_short.max} over={over === "situation_short"} />
            </div>
            <Input id="situation_short" value={d.situation_short} onChange={(e) => limited("situation_short", LIMITS.situation_short.max, (s) => setD({ ...d, situation_short: s }))(e.target.value)}
              onBlur={() => touch("situation_short")} placeholder="상황을 20자 안으로 짧게 적어주세요 (예: 웹 페이지 개발, 백엔드 디버깅)" aria-invalid={showErr("situation_short") || undefined} aria-describedby="situation_short-err" />
            <p id="situation_short-err" className="min-h-4 text-xs text-destructive">{showErr("situation_short") ? "상황을 20자 안으로 짧게 적어주세요 (예: 웹 페이지 개발, 백엔드 디버깅)" : null}</p>
          </div>
          {/* 주제 (EL-HOME-027, BR-029) — 필수, 네이티브 라디오라 키보드·스크린리더 그대로 */}
          <fieldset className="grid gap-2" aria-describedby="topic-err">
            <legend className="mb-2 text-sm font-medium">주제</legend>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <label key={t} className="cursor-pointer">
                  <input type="radio" name="topic" value={t} checked={d.topic === t} onChange={() => setD({ ...d, topic: t })} className="peer sr-only" />
                  <span className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                    {TOPIC_LABELS[t]}
                  </span>
                </label>
              ))}
            </div>
            <p id="topic-err" className="min-h-4 text-xs text-destructive">{showErr("topic") ? "어떤 작업인지 주제를 골라주세요" : null}</p>
          </fieldset>
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <Label htmlFor="situation" className="text-sm font-medium">상황 상세 (선택)</Label>
              <Counter n={charCount(d.situation)} max={LIMITS.situation.max} over={over === "situation"} />
            </div>
            <Textarea id="situation" rows={3} value={d.situation} onChange={(e) => limited("situation", LIMITS.situation.max, (s) => setD({ ...d, situation: s }))(e.target.value)}
              placeholder="어떤 상황에서 쓰는 워크플로우인가요? 자세히 적어주면 상세 페이지에 실려요 (선택)" />
          </div>

          {/* 상세 템플릿 (EL-HOME-028~031, BR-028) — 선택이라 접어 둔다. 값이 있으면 펼친 채로 */}
          <details className="group rounded-lg border border-border px-4 py-3" open={DETAIL_FIELDS.some((k) => d[k]) || undefined}>
            <summary className="cursor-pointer text-sm font-medium">자세히 적기 (선택) — 예상 결과·준비물·주의사항·확인 환경</summary>
            <div className="mt-4 grid gap-5">
              {DETAIL_UI.map(({ key, label, rows }) => (
                <div key={key} className="grid gap-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <Label htmlFor={key} className="text-sm font-medium">{label}</Label>
                    <Counter n={charCount(d[key])} max={LIMITS[key].max} over={over === key} />
                  </div>
                  {rows ? (
                    <Textarea id={key} rows={rows} value={d[key]} onChange={(e) => limited(key, LIMITS[key].max, (s) => setD({ ...d, [key]: s }))(e.target.value)} />
                  ) : (
                    <Input id={key} value={d[key]} onChange={(e) => limited(key, LIMITS[key].max, (s) => setD({ ...d, [key]: s }))(e.target.value)} />
                  )}
                </div>
              ))}
            </div>
          </details>
        </fieldset>

        {/* 단계 (EL-HOME-008~011) */}
        <fieldset className="grid gap-4" aria-labelledby="steps-label">
          <div className="flex items-baseline justify-between gap-4">
            {/* legend는 fieldset 직계 자식이어야 이름이 된다 — 이 레이아웃에선 불가라 aria-labelledby로 */}
            <span id="steps-label" className="text-sm font-medium">단계 — 2~8개, 쓰는 순서대로</span>
            <Counter n={d.steps.length} max={LIMITS.steps.max} />
          </div>
          <ol className="grid gap-4">
            {d.steps.map((s, i) => {
              const incomplete = ctaTried && stepIncomplete(s);
              return (
                <li key={i}>
                  <Card className="gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-[0.625rem] font-medium text-background">{String(i + 1).padStart(2, "0")}</span>
                      <span className="font-mono text-sm font-medium">{s.tool.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{s.tool.category}</span>
                      <div className="ml-auto flex gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="위로" disabled={i === 0} onClick={() => moveStep(i, -1)}>↑</Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="아래로" disabled={i === d.steps.length - 1} onClick={() => moveStep(i, 1)}>↓</Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="단계 삭제" onClick={() => removeStep(i)}>×</Button>
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`note-${i}`} className="sr-only">단계 {i + 1} 메모</Label>
                      <Input id={`note-${i}`} value={s.note} onChange={(e) => limited(`note-${i}`, LIMITS.step_note.max, (v) => patchStep(i, { note: v }))(e.target.value)}
                        placeholder="이 단계에서 이 도구로 뭘 하나요? (카드에 한 줄로 — 필수)" aria-invalid={incomplete || undefined} />
                      <Counter n={charCount(s.note)} max={LIMITS.step_note.max} over={over === `note-${i}`} />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`detail-${i}`} className="sr-only">단계 {i + 1} 상세</Label>
                      <Textarea id={`detail-${i}`} rows={2} value={s.detail} onChange={(e) => limited(`detail-${i}`, LIMITS.step_detail.max, (v) => patchStep(i, { detail: v }))(e.target.value)}
                        placeholder="어떻게 쓰는지 자세히 (상세 페이지에 실려요 — 필수)" aria-invalid={incomplete || undefined} />
                      <Counter n={charCount(s.detail)} max={LIMITS.step_detail.max} over={over === `detail-${i}`} />
                    </div>
                    {/* 참고 링크 (BR-027) — 카탈로그 도구는 출처가 이미 있어 숨긴다 */}
                    {!isCatalogTool(s.tool.name) && (
                      <div className="grid gap-1">
                        <Label htmlFor={`url-${i}`} className="text-sm font-normal text-muted-foreground">참고 링크 (선택)</Label>
                        <Input id={`url-${i}`} type="url" inputMode="url" value={s.tool.url ?? ""}
                          onChange={(e) => limited(`url-${i}`, LIMITS.tool_url.max, (v) => patchStep(i, { tool: { ...s.tool, url: v } }))(e.target.value)}
                          onBlur={() => touch(`url-${i}`)} placeholder="https://github.com/… — 비우면 링크 없이 표시돼요"
                          aria-invalid={urlErr(i, s) || undefined} aria-describedby={`url-${i}-err`} />
                        {/* 문구 자리 상시 확보 — blur 때 레이아웃 밀림 방지 */}
                        <p id={`url-${i}-err`} className="min-h-4 text-xs text-destructive">{urlErr(i, s) ? "https://로 시작하는 주소를 입력해주세요" : null}</p>
                      </div>
                    )}
                    {canMarkCustom(s.tool) && (
                      <Label className="font-normal mt-2 flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={s.tool.custom === true}
                          onCheckedChange={(c) => patchStep(i, { tool: { ...s.tool, custom: c === true } })}
                        />
                        <span style={{ wordBreak: "keep-all" }}>공개된 도구가 아니에요 — 카드에 표시할게요</span>
                      </Label>
                    )}
                    {incomplete && <p className="text-xs text-destructive">각 단계에 한 줄 메모와 설명을 채워주세요</p>}
                  </Card>
                </li>
              );
            })}
          </ol>
          {picking ? (
            <ToolPicker categories={CATEGORIES} onPick={addStep} searchPlaceholder="도구 이름으로 검색" autoFocus />
          ) : (
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" disabled={d.steps.length >= LIMITS.steps.max} onClick={() => setPicking(true)}>단계 추가</Button>
              {d.steps.length >= LIMITS.steps.max && <p className="text-xs text-muted-foreground">단계는 8개까지예요 — 핵심만 남겨보세요</p>}
            </div>
          )}
        </fieldset>

        {/* 추천 프롬프트 (EL-HOME-032, BR-028) — 워크플로우당 1개, 단계를 한 번에 실행하는 지시 (2026-11-24) */}
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <Label htmlFor="prompt" className="text-sm font-medium">추천 프롬프트 (선택) — 이 워크플로우를 한 번에 실행하는 지시</Label>
            <Counter n={charCount(d.prompt)} max={LIMITS.prompt.max} over={over === "prompt"} />
          </div>
          <Textarea id="prompt" rows={5} value={d.prompt}
            onChange={(e) => limited("prompt", LIMITS.prompt.max, (s) => setD({ ...d, prompt: s }))(e.target.value)}
            placeholder={"예: 이 버그를 고쳐줘. 1) 재현 조건을 문장으로 적고 2) 호출부를 전부 찾은 뒤 3) 원인 한 곳만 고쳐"}
            aria-describedby="prompt-note" />
          <p id="prompt-note" className="text-xs text-muted-foreground">API 키·비밀번호·개인정보는 넣지 마세요 — 공개되면 누구나 복사할 수 있어요</p>
        </div>

        {/* 개발 스택 태그 (EL-HOME-012) */}
        <fieldset className="grid gap-3" aria-labelledby="stack-label">
          <div className="flex items-baseline justify-between gap-4">
            <span id="stack-label" className="text-sm font-medium">이 워크플로우를 쓰는 개발 스택 (선택, 4개까지)</span>
            <Counter n={d.dev_stack.length} max={LIMITS.dev_stack.max} />
          </div>
          {d.dev_stack.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="선택한 스택">
              {d.dev_stack.map((t) => (
                <li key={t.name}>
                  {/* Badge asChild = 칩 모양 + 포커스 링, 요소는 button 유지 */}
                  <Badge asChild variant="secondary" className="h-auto px-3 py-1 font-mono font-normal hover:bg-destructive/10 hover:text-destructive">
                    <button type="button" onClick={() => setD({ ...d, dev_stack: d.dev_stack.filter((x) => x.name !== t.name) })} aria-label={`${t.name} 해제`}>
                      {t.name} ×
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {d.dev_stack.length < LIMITS.dev_stack.max ? (
            <ToolPicker categories={DEV_STACK_CATEGORIES} onPick={(t) => addTag(t as Draft["dev_stack"][number])} searchPlaceholder="스택 이름으로 검색 — 없으면 직접 입력" excludeNames={d.dev_stack.map((t) => t.name)} />
          ) : (
            <p className="text-xs text-muted-foreground">개발 스택 태그는 4개까지예요</p>
          )}
        </fieldset>

        {/* 소속·역할 (EL-HOME-013) */}
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <Label htmlFor="role" className="text-sm font-medium">소속·역할 (선택 — 회사, 학교, 사이드 프로젝트 뭐든)</Label>
            <Counter n={charCount(d.role)} max={LIMITS.role.max} over={over === "role"} />
          </div>
          <Input id="role" value={d.role} onChange={(e) => limited("role", LIMITS.role.max, (s) => setD({ ...d, role: s }))(e.target.value)} />
        </div>

        {/* CTA (EL-HOME-014) — 게이트 미충족이면 비활성 + 안내. 모바일 하단 sticky */}
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 md:static md:m-0 md:border-0 md:bg-transparent md:p-0">
          <div className="flex flex-wrap items-center gap-4">
            {gateOk ? (
              <Button asChild size="lg" className="h-11 px-6"><Link href="/card">{ctaLabel}</Link></Button>
            ) : (
              <Button type="button" size="lg" className="h-11 px-6" aria-disabled onClick={() => setCtaTried(true)}>{ctaLabel}</Button>
            )}
            {!gateOk && (
              <p className="text-sm text-muted-foreground">제목·상황·주제를 정하고, 단계를 2개 이상(각각 한 줄 메모와 설명 포함) 담으면 카드를 만들 수 있어요</p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
