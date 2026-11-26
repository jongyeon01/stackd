"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkCheck, Copy } from "lucide-react";
import { toast } from "sonner";
import { forkWorkflow, toggleBookmark } from "@/app/actions/workflow";
import { signInWithGitHub } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/confirm-dialog";
import { track } from "@/lib/analytics";

type Props = { id: string; loggedIn: boolean; bookmarked: boolean };
type Act = "fork" | "bookmark";

// EL-WF-015·016 — 타인 공개 워크플로우의 복제·저장 (2.0 판정 측정 행동, BR-030·031)
export default function WorkflowEngage({ id, loggedIn, bookmarked }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [saved, setSaved] = useState(bookmarked); // 낙관적 값 — 실패하면 되돌린다
  const [pending, startTransition] = useTransition(); // 복제 전용
  const [bookmarking, startBookmark] = useTransition(); // 저장 전용 — 복제 버튼을 잠그지 않게
  const [signingIn, startSignIn] = useTransition(); // 로그인 이동 중 버튼 잠금
  const [gateAct, setGateAct] = useState<Act | null>(null); // 로그인 안내 dialog 대상 (EL-WF-017)
  const ran = useRef(false);

  function fork() {
    startTransition(async () => {
      const r = await forkWorkflow(id).catch(() => ({ ok: false as const, code: "ERR-WF-003" }));
      if (!r.ok) {
        toast.error(r.code === "ERR-WF-001" ? "이 워크플로우는 지금 복제할 수 없어요" : "복제하지 못했어요 — 다시 시도해주세요");
        return;
      }
      track("workflow_fork", { workflow_id: id, stage: "done" });
      toast.success("복제했어요 — 비공개로 만들어졌어요");
      router.push(`/create?edit=${r.id}`);
    });
  }

  function bookmark(on: boolean) {
    // 요청 중 재클릭은 무시 — 버튼을 흐리지 않으면서 on/off 요청 순서 꼬임을 막는다
    if (bookmarking) return;
    setSaved(on); // 낙관적 반영 — 공개 전환과 같은 패턴
    startBookmark(async () => {
      const r = await toggleBookmark(id, on).catch(() => ({ ok: false }));
      if (!r.ok) {
        setSaved(!on); // 롤백 (REQ-WF-009 AC-2·3)
        toast.error("저장하지 못했어요 — 다시 시도해주세요");
        return;
      }
      if (on) {
        track("workflow_bookmark", { workflow_id: id, stage: "done" });
        toast.success("보관함에 저장했어요");
      }
    });
  }

  // 비로그인 클릭 = 로그인 벽. 바로 보내지 않고 안내부터 (EL-WF-017, REQ-WF-008·009 AC-5)
  // gate 이벤트는 클릭 시점 그대로 — 로그인 벽 비용의 기준점 (PRD-15)
  function gate(act: Act) {
    track(act === "fork" ? "workflow_fork" : "workflow_bookmark", { workflow_id: id, stage: "gate" });
    setGateAct(act);
  }
  const actLabel = gateAct === "fork" ? "복제" : "저장";

  // OAuth 복귀 — act는 URL에서 먼저 지워 새로고침해도 중복 실행하지 않는다
  useEffect(() => {
    const act = params.get("act");
    if (ran.current || !loggedIn || (act !== "fork" && act !== "bookmark")) return;
    ran.current = true;
    router.replace(pathname, { scroll: false });
    const run = act === "fork" ? fork : () => !bookmarked && bookmark(true);
    run(); // OAuth 복귀 신호(URL)를 받아 1회 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
  }, []);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          aria-pressed={saved}
          onClick={() => (loggedIn ? bookmark(!saved) : gate("bookmark"))}
          className="h-11 px-6"
        >
          {saved ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
          {saved ? "저장됨" : "저장"}
        </Button>
        <Button disabled={pending} onClick={() => (loggedIn ? fork() : gate("fork"))} className="h-11 px-6">
          <Copy aria-hidden />
          내 방식으로 복제
        </Button>
      </div>
      <p className="mt-3 max-w-[62ch] text-sm leading-[1.75] text-muted-foreground">
        저장은 원본을 보관함에 담고, 복제는 내 워크플로우로 가져와 고칠 수 있어요
      </p>
      {/* EL-WF-017 로그인 안내 — 헤더와 같은 서버 액션, 복귀 주소에 act를 실어 돌아오면 1회 실행 */}
      <ConfirmDialog
        open={gateAct !== null}
        onOpenChange={(open) => !open && setGateAct(null)}
        title="로그인이 필요해요"
        description={`${actLabel}하려면 GitHub 로그인이 필요해요. 로그인 후 이 페이지로 돌아와 바로 ${actLabel}돼요.`}
        confirmLabel="GitHub으로 로그인"
        onConfirm={() => {
          const fd = new FormData();
          fd.set("next", `${pathname}?act=${gateAct ?? "bookmark"}`);
          startSignIn(() => signInWithGitHub(fd));
        }}
        pending={signingIn}
      />
    </div>
  );
}
