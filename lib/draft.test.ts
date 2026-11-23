import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DRAFT_KEY, EMPTY_DRAFT, clearDraft, isDraftEmpty, loadDraft, saveDraft, type Draft } from "./draft.ts";

// node에는 localStorage가 없다 — 최소 인메모리 스텁
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, v),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  get length() { return store.size; },
} as Storage;

beforeEach(() => store.clear());

const sample = (): Draft => ({
  ...EMPTY_DRAFT,
  title: "PR 리뷰 자동화",
  situation_short: "PR 올릴 때",
  steps: [{ tool: { name: "Claude Code", category: "agent" }, note: "리뷰", detail: "diff 읽기" }],
});

// TC-HOME-005-01: 저장 → 복원 일치
test("save → load 왕복 시 전 필드 일치", () => {
  saveDraft(sample());
  assert.deepEqual(loadDraft(), sample());
});

// TC-HOME-005-02: 손상·구버전 초안은 조용히 폐기
test("JSON 손상 초안은 null + 저장소에서 제거", () => {
  store.set(DRAFT_KEY, "{not json");
  assert.equal(loadDraft(), null);
  assert.equal(store.has(DRAFT_KEY), false);
});

test("v 불일치 초안은 null + 제거", () => {
  store.set(DRAFT_KEY, JSON.stringify({ ...sample(), v: 1 }));
  assert.equal(loadDraft(), null);
  assert.equal(store.has(DRAFT_KEY), false);
});

test("필수 키 누락 초안은 null", () => {
  store.set(DRAFT_KEY, JSON.stringify({ v: 2, title: "x" }));
  assert.equal(loadDraft(), null);
});

test("초안 없음 → null", () => {
  assert.equal(loadDraft(), null);
});

test("clearDraft 후 load는 null", () => {
  saveDraft(sample());
  clearDraft();
  assert.equal(loadDraft(), null);
});

// 배너 노출 조건 — 빈 초안은 복원할 게 없다
test("isDraftEmpty: 입력 0건이면 true, 제목만 있어도 false", () => {
  assert.equal(isDraftEmpty(EMPTY_DRAFT), true);
  assert.equal(isDraftEmpty({ ...EMPTY_DRAFT, title: "a" }), false);
  assert.equal(isDraftEmpty({ ...EMPTY_DRAFT, steps: sample().steps }), false);
});

test("localStorage 예외(프라이빗 모드 등)는 삼킨다", () => {
  const broken = globalThis.localStorage;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    ...broken, getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); },
  } as Storage;
  assert.doesNotThrow(() => saveDraft(sample()));
  assert.equal(loadDraft(), null);
  (globalThis as unknown as { localStorage: Storage }).localStorage = broken;
});

// TC-HOME-010-02: 2.0 이전 초안(새 키 없음)도 폐기하지 않고 빈 값으로 채워 복원 (PRD-05 — v 유지)
test("2.0 키 없는 구 초안 → 빈 값 보충 후 복원", () => {
  const old = { v: 2, title: "옛 초안", situation_short: "", situation: "", steps: [], dev_stack: [], role: "", accent: "ink", is_public: true };
  store.set(DRAFT_KEY, JSON.stringify(old));
  const d = loadDraft();
  assert.ok(d);
  assert.equal(d.title, "옛 초안");
  assert.equal(d.topic, "");
  assert.equal(d.expected_result, "");
  assert.equal(d.tested_env, "");
});

test("isDraftEmpty: 2.0 필드만 입력해도 false", () => {
  assert.equal(isDraftEmpty({ ...EMPTY_DRAFT, topic: "debug" }), false);
  assert.equal(isDraftEmpty({ ...EMPTY_DRAFT, caveats: "비용 주의" }), false);
});
