"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { toggleBookmark } from "@/app/actions/workflow";
import { Button } from "@/components/ui/button";

// EL-ME-012·013 저장 해제 (REQ-ME-007) — 이미 해제돼 있어도 성공(멱등), 목록은 서버가 다시 그린다
export default function BookmarkRemove({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const r = await toggleBookmark(id, false).catch(() => ({ ok: false }));
      if (!r.ok) {
        toast.error("저장하지 못했어요 — 다시 시도해주세요"); // CPY-WF-025 · ERR-WF-002
        return;
      }
      router.refresh(); // revalidatePath('/me') 결과를 받아 행이 빠진다
    });
  }

  return (
    <Button variant="outline" onClick={remove} disabled={pending} className="h-11 px-5">
      저장 해제
    </Button>
  );
}
