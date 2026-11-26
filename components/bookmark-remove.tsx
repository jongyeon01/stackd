"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { toggleBookmark } from "@/app/actions/workflow";
import { Button } from "@/components/ui/button";

// EL-ME-012·013 저장 행 + 해제 (REQ-ME-007) — 이미 해제돼 있어도 성공(멱등)
// 행 내용은 children(서버 렌더). 해제는 즉시 숨기고 실패하면 되돌린다 — 공개 전환과 같은 낙관적 패턴
export default function BookmarkRemove({ id, children }: { id: string; children: ReactNode }) {
  const router = useRouter();
  const [removed, setRemoved] = useState(false); // 낙관적 값
  const [, startTransition] = useTransition();

  function remove() {
    setRemoved(true); // 행 즉시 제거
    startTransition(async () => {
      const r = await toggleBookmark(id, false).catch(() => ({ ok: false }));
      if (!r.ok) {
        setRemoved(false); // 롤백
        toast.error("저장하지 못했어요 — 다시 시도해주세요"); // CPY-WF-025 · ERR-WF-002
        return;
      }
      router.refresh(); // revalidatePath('/me') 결과로 목록 확정 (마지막 행이면 Empty)
    });
  }

  if (removed) return null;
  return (
    <li className="grid gap-3">
      {children}
      <div className="justify-self-end">
        <Button variant="outline" onClick={remove} className="h-11 px-5">
          저장 해제
        </Button>
      </div>
    </li>
  );
}
