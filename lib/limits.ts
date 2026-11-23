// 공용 제한 유틸 (BR-007) — 빌더 입력·서버 액션·OG 렌더 3곳이 같은 함수를 쓴다. 순수 함수만.

// 필드별 길이·개수 한도 (PRD-08 BR)
export const LIMITS = {
  title: { min: 1, max: 30 }, // BR-010
  situation_short: { min: 1, max: 20 }, // BR-011
  situation: { min: 0, max: 1000 }, // BR-012
  steps: { min: 2, max: 8 }, // BR-001
  tool_name: { min: 1, max: 40 }, // BR-002
  tool_url: { min: 0, max: 300 }, // BR-027
  step_note: { min: 1, max: 60 }, // BR-013
  step_detail: { min: 1, max: 500 }, // BR-014
  dev_stack: { min: 0, max: 4 }, // BR-015
  role: { min: 0, max: 20 }, // BR-008
  feedback_body: { min: 1, max: 500 }, // BR-021
  hidden_reason: { min: 1, max: 200 }, // BR-018
  expected_result: { min: 0, max: 300 }, // BR-028 (2.0)
  prerequisites: { min: 0, max: 500 }, // BR-028
  caveats: { min: 0, max: 500 }, // BR-028
  tested_env: { min: 0, max: 200 }, // BR-028 — 작성자 자기 신고
  step_prompt: { min: 0, max: 2000 }, // BR-028
  search_q: { max: 50 }, // BR-033
} as const;

// 주제 enum 6종 (BR-029) — 순서 = 칩 표시 순서 (CPY-COMMON-011)
export const TOPICS = ["build", "review", "test", "debug", "deploy", "automation"] as const;
export type Topic = (typeof TOPICS)[number];

// 상세 템플릿 선택 필드 (BR-028) — 검증·초안·복제가 같은 목록을 돈다
export const DETAIL_FIELDS = ["expected_result", "prerequisites", "caveats", "tested_env"] as const;

// 카테고리 enum 7종 (BR-004) — dev_stack은 앞 3종만
export const CATEGORIES = ["language", "framework", "tool", "skill", "plugin", "mcp", "agent"] as const;
export const DEV_STACK_CATEGORIES = ["language", "framework", "tool"] as const;
// custom 표시가 가능한 카테고리 (BR-026) — 언어·프레임워크엔 "공개 안 됨"이 성립하지 않는다
export const CUSTOMIZABLE_CATEGORIES = ["skill", "plugin", "mcp", "agent"] as const;
export type Category = (typeof CATEGORIES)[number];
export type DevStackCategory = (typeof DEV_STACK_CATEGORIES)[number];

// 검증 통과 후 정규화된 워크플로우 입력 (서버 액션이 그대로 insert)
export type WorkflowInput = {
  title: string;
  situation_short: string;
  situation: string;
  steps: { tool: { name: string; category: Category; custom?: boolean; url?: string }; note: string; detail: string; prompt?: string }[];
  dev_stack: { name: string; category: DevStackCategory }[];
  role: string;
  accent: string;
  is_public: boolean;
  topic: Topic;
  expected_result: string;
  prerequisites: string;
  caveats: string;
  tested_env: string;
};

// "자" = 사용자가 보는 글자 수 (grapheme) — 이모지 1개 = 1자 (BR-003)
const segmenter = new Intl.Segmenter();
export function charCount(s: string) {
  return [...segmenter.segment(s)].length;
}

export type LimitError = { ok: false; code: string; field: string };
export type Result<T> = { ok: true; value: T } | LimitError;

const fail = (code: string, field: string): LimitError => ({ ok: false, code, field });

// 문자열 trim 후 min~max 글자 수면 반환, 아니면 null
function str(v: unknown, { min, max }: { min: number; max: number }) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  const n = charCount(t);
  return n >= min && n <= max ? t : null;
}

const isIn = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v);

// 도구 링크 정규화 — "" = 없음, null = 위반 (BR-027)
export function toolUrl(v: unknown): string | null {
  const t = str(v ?? "", LIMITS.tool_url);
  if (t === null) return null;
  if (!t) return "";
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

// 워크플로우 입력 검증 — 실패 시 첫 위반의 에러 코드·필드 반환 (PRD-10)
export function validateWorkflow(input: unknown): Result<WorkflowInput> {
  const d = (input ?? {}) as Record<string, unknown>;

  const title = str(d.title, LIMITS.title);
  if (title === null) return fail("ERR-BLDR-003", "title");
  const situation_short = str(d.situation_short, LIMITS.situation_short);
  if (situation_short === null) return fail("ERR-BLDR-004", "situation_short");
  const situation = str(d.situation ?? "", LIMITS.situation);
  if (situation === null) return fail("ERR-BLDR-005", "situation");

  if (!Array.isArray(d.steps) || d.steps.length < LIMITS.steps.min) return fail("ERR-CARD-001", "steps");
  if (d.steps.length > LIMITS.steps.max) return fail("ERR-BLDR-001", "steps");
  const steps: WorkflowInput["steps"] = [];
  for (const [i, raw] of d.steps.entries()) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const tool = (s.tool ?? {}) as Record<string, unknown>;
    const name = str(tool.name, LIMITS.tool_name);
    if (name === null) return fail("ERR-BLDR-002", `steps.${i}.tool.name`);
    if (!isIn(CATEGORIES, tool.category)) return fail("ERR-CARD-001", `steps.${i}.tool.category`);
    const note = str(s.note, LIMITS.step_note);
    if (note === null) return fail("ERR-BLDR-005", `steps.${i}.note`);
    const detail = str(s.detail, LIMITS.step_detail);
    if (detail === null) return fail("ERR-BLDR-005", `steps.${i}.detail`);
    // custom = 카탈로그에 없는 도구 표시 (BR-026). false는 기본값이라 저장하지 않는다
    if (tool.custom !== undefined && typeof tool.custom !== "boolean") return fail("ERR-BLDR-008", `steps.${i}.tool.custom`);
    if (tool.custom === true && !isIn(CUSTOMIZABLE_CATEGORIES, tool.category)) return fail("ERR-BLDR-008", `steps.${i}.tool.custom`);
    const t: WorkflowInput["steps"][number]["tool"] = { name, category: tool.category };
    if (tool.custom === true) t.custom = true;
    // 참고 링크 (BR-027) — 빈 값 = 링크 없음, 있으면 http(s)만 (javascript: href 차단)
    const url = toolUrl(tool.url);
    if (url === null) return fail("ERR-BLDR-009", `steps.${i}.tool.url`);
    if (url) t.url = url;
    // 프롬프트 (BR-028) — 원문 보존(trim 안 함, 복사용 BR-032). 공백뿐이면 키 제거
    const step: WorkflowInput["steps"][number] = { tool: t, note, detail };
    if (s.prompt !== undefined && s.prompt !== null) {
      if (typeof s.prompt !== "string" || charCount(s.prompt) > LIMITS.step_prompt.max) return fail("ERR-BLDR-010", `steps.${i}.prompt`);
      if (s.prompt.trim()) step.prompt = s.prompt;
    }
    steps.push(step);
  }

  const rawStack = d.dev_stack ?? [];
  if (!Array.isArray(rawStack) || rawStack.length > LIMITS.dev_stack.max) return fail("ERR-BLDR-006", "dev_stack");
  const dev_stack: WorkflowInput["dev_stack"] = [];
  for (const [i, raw] of rawStack.entries()) {
    const t = (raw ?? {}) as Record<string, unknown>;
    const name = str(t.name, LIMITS.tool_name);
    if (name === null) return fail("ERR-BLDR-002", `dev_stack.${i}.name`);
    if (!isIn(DEV_STACK_CATEGORIES, t.category)) return fail("ERR-CARD-001", `dev_stack.${i}.category`);
    dev_stack.push({ name, category: t.category });
  }

  const roleResult = validateRole(d.role);
  if (!roleResult.ok) return roleResult;
  const role = roleResult.value;

  const topic = parseTopic(d.topic);
  if (topic === null) return fail("ERR-BLDR-011", "topic");
  const detailValues = {} as Record<(typeof DETAIL_FIELDS)[number], string>;
  for (const k of DETAIL_FIELDS) {
    const v = str(d[k] ?? "", LIMITS[k]);
    if (v === null) return fail("ERR-BLDR-010", k);
    detailValues[k] = v;
  }

  return {
    ok: true,
    value: {
      title, situation_short, situation, steps, dev_stack, role,
      accent: typeof d.accent === "string" && d.accent ? d.accent : "ink", // 미인식 슬러그는 서버가 팔레트로 재확인
      is_public: d.is_public !== false, // 기본 true (BR-017)
      topic,
      ...detailValues,
    },
  };
}

// 소속·역할 검증 (BR-008) — 빌더와 설정의 기본값 폼이 같은 규칙을 쓴다
// 길이만 본다 — 문자셋 제한 없음(BR-003), 빈 값은 "미설정"으로 통과
export function validateRole(role: unknown): Result<string> {
  const t = str(role ?? "", LIMITS.role);
  return t === null ? fail("ERR-CARD-003", "role") : { ok: true, value: t };
}

// 탈퇴 확인 입력 대조 (SCR-008 §7) — GitHub 핸들은 대소문자를 구분하지 않는다
export function matchesHandle(input: unknown, handle: string | null | undefined) {
  if (typeof input !== "string" || !handle) return false;
  return input.trim().toLowerCase() === handle.trim().toLowerCase();
}

// 신고·문의 본문 검증 (BR-021) — 통과 시 trim된 본문
export function validateFeedbackBody(body: unknown): Result<string> {
  const t = str(body, LIMITS.feedback_body);
  return t === null ? fail("ERR-FB-001", "body") : { ok: true, value: t };
}

// 숨김 사유 검증 (BR-018) — hidden=true일 때 필수, 상세 페이지에 모두에게 표시된다
export function validateHiddenReason(reason: unknown): Result<string> {
  const t = str(reason, LIMITS.hidden_reason);
  return t === null ? fail("ERR-ADMIN-002", "reason") : { ok: true, value: t };
}

// 주제 파싱 (BR-029) — enum 밖은 null (라이브러리는 무시, 저장은 거부)
export function parseTopic(v: unknown): Topic | null {
  return isIn(TOPICS, v) ? v : null;
}

// 검색어 정규화 (BR-033) — trim 후 50자 절삭, 없으면 ""
export function normalizeQuery(v: unknown): string {
  if (typeof v !== "string") return "";
  return [...segmenter.segment(v.trim())].slice(0, LIMITS.search_q.max).map((s) => s.segment).join("");
}

// ilike 패턴 — 소문자 search_text와 맞추고 와일드카드는 리터럴로 (BR-033)
export function likePattern(q: string): string {
  return `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
