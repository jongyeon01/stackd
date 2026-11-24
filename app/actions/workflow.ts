"use server";

import { revalidatePath } from "next/cache";
import { ACCENTS } from "@/components/workflow-card";
import { validateWorkflow } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";

export type SaveResult = { ok: true; id: string } | { ok: false; code: string };

// 워크플로우 id = 16진 8자 (BR-023)
const newId = () => crypto.randomUUID().slice(0, 8);

// 카드 저장 — 신규 insert / editId 있으면 소유자 update (PRD-06 saveWorkflow)
export async function saveWorkflow(draft: unknown, editId?: string): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, code: "ERR-AUTH-001" };

  // 클라이언트 게이트와 같은 함수로 재검증 (BR-007)
  const parsed = validateWorkflow(draft);
  if (!parsed.ok) return { ok: false, code: "ERR-CARD-001" };

  const meta = claims.claims.user_metadata ?? {};
  const row = {
    ...parsed.value,
    // 팔레트 밖 슬러그는 기본값으로 (PRD-05)
    accent: parsed.value.accent in ACCENTS ? parsed.value.accent : "ink",
    // 작성자는 저장 시점 GitHub 스냅샷 (BR-025)
    author_handle: (meta.user_name as string | undefined) ?? "unknown",
    author_avatar: (meta.avatar_url as string | undefined) ?? null,
    user_id: userId,
  };

  if (editId) {
    // 소유권 = RLS 1차, user_id 조건이 2차 (BR-024)
    const { data, error } = await supabase
      .from("workflows")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", editId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, code: "ERR-CARD-004" };
    // 0행 = 삭제됐거나 타인 카드. 세션은 위에서 확인했으므로 인증 문제가 아니다 (ERR-CARD-006)
    if (!data) return { ok: false, code: "ERR-CARD-006" };
    return { ok: true, id: data.id };
  }

  // id 충돌 시 최대 3회 재생성 (BR-023)
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase
      .from("workflows")
      .insert({ ...row, id: newId() })
      .select("id")
      .single();
    if (data) return { ok: true, id: data.id };
    if (error?.code !== "23505") break; // 충돌 외 오류는 재시도해도 같다
  }
  return { ok: false, code: "ERR-CARD-004" };
}

export type ActionResult = { ok: boolean; code?: string };

// 세션 uid — 없으면 null (쓰기 액션 공통 진입 검사)
async function currentUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

// 카드 삭제 — 소유자만 (BR-024, PRD-06 deleteWorkflow)
export async function deleteWorkflow(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, code: "ERR-AUTH-001" };

  const { error, count } = await supabase
    .from("workflows")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", userId);
  // count 0 = 타인 카드거나 이미 없음 — 존재 여부를 구분해 알리지 않는다 (BR-006)
  if (error || !count) return { ok: false, code: "ERR-ME-001" };
  revalidatePath("/me"); // 목록에서 즉시 빠져야 한다 (REQ-ME-003 AC-1)
  return { ok: true };
}

// 공개 전환 — hidden 카드는 전환 불가 (BR-018)
export async function togglePublic(id: string, isPublic: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, code: "ERR-AUTH-001" };

  const { error, count } = await supabase
    .from("workflows")
    .update({ is_public: isPublic, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("hidden", false);
  if (error || !count) return { ok: false, code: "ERR-ME-001" };
  revalidatePath("/me"); // 배지·스위치의 원본은 서버다 (REQ-ME-004 AC-1)
  return { ok: true };
}

// 복제 시 원본에서 옮기는 필드 — 소유·공개·출처·작성자는 새로 정한다 (BR-030)
const FORK_FIELDS =
  "id, user_id, title, situation_short, situation, topic, expected_result, prerequisites, caveats, tested_env, prompt, steps, dev_stack, accent";

// 복제 — 남의 공개 워크플로우를 비공개 사본으로 (PRD-06 forkWorkflow, BR-030)
export async function forkWorkflow(id: string): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, code: "ERR-AUTH-001" };

  // 공개·비hidden·타인 소유만 — 그 외는 존재를 구분하지 않고 같은 코드 (ERR-WF-001)
  const { data: src } = await supabase
    .from("workflows")
    .select(FORK_FIELDS)
    .eq("id", id)
    .eq("is_public", true)
    .eq("hidden", false)
    .maybeSingle();
  if (!src || src.user_id === userId) return { ok: false, code: "ERR-WF-001" };

  const { id: originId, user_id: _owner, ...fields } = src; // eslint-disable-line @typescript-eslint/no-unused-vars -- 소유자는 버린다
  const meta = claims.claims.user_metadata ?? {};
  const row = {
    ...fields,
    forked_from: originId,
    is_public: false, // 변조 재배포 방지 — 공개는 복제자가 직접 (PRD-08 악용 #9)
    role: null, // 소속은 원작자 것이라 비운다
    author_handle: (meta.user_name as string | undefined) ?? "unknown",
    author_avatar: (meta.avatar_url as string | undefined) ?? null,
    user_id: userId,
  };

  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase.from("workflows").insert({ ...row, id: newId() }).select("id").single();
    if (data) {
      revalidatePath("/me");
      return { ok: true, id: data.id };
    }
    if (error?.code !== "23505") break; // id 충돌만 재시도 (BR-023)
  }
  return { ok: false, code: "ERR-WF-003" };
}

// 저장 토글 — on: 멱등 insert / off: 내 행 delete (PRD-06 toggleBookmark, BR-031)
export async function toggleBookmark(id: string, on: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, code: "ERR-AUTH-001" };

  // 공개·비hidden 검사는 RLS insert 정책이 한다 (PRD-05) — 거부되면 error
  const { error } = on
    ? await supabase.from("bookmarks").upsert({ user_id: userId, workflow_id: id }, { ignoreDuplicates: true })
    : await supabase.from("bookmarks").delete().eq("user_id", userId).eq("workflow_id", id);
  if (error) return { ok: false, code: "ERR-WF-002" };
  revalidatePath("/me");
  return { ok: true };
}
