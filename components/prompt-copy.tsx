"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

// EL-WF-014 프롬프트 복사 — 원문 그대로, 실행은 하지 않는다 (BR-032)
export default function PromptCopy({ id, index, text }: { id: string; index: number; text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("복사했어요");
      track("prompt_copy", { workflow_id: id, step_index: index });
    } catch {
      // 클립보드 거부 — 블록을 선택해 두고 직접 복사 안내 (ERR-SHARE-003 재사용)
      const pre = document.getElementById(`prompt-${index}`);
      if (pre) window.getSelection()?.selectAllChildren(pre);
      toast.error("복사가 안 되면 선택된 내용을 직접 복사해주세요");
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={copy} aria-label={`단계 ${index + 1} 프롬프트 복사`}>
      프롬프트 복사
    </Button>
  );
}
