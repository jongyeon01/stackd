"use client";

import { useTransition } from "react";
import { signOut } from "@/app/auth/actions";
import ConfirmDialog from "@/components/confirm-dialog";

// 로그아웃 확인 — 헤더·모바일 시트·설정 공용
export default function LogoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="로그아웃할까요?" // CPY-COMMON-013
      description="다시 로그인하면 내 워크플로우와 저장한 워크플로우를 그대로 볼 수 있어요." // CPY-COMMON-014
      confirmLabel="로그아웃" // CPY-SET-002
      // 서버 액션이 쿠키를 지우고 redirect('/') — 여기로 돌아오지 않는다
      onConfirm={() => startTransition(() => signOut())}
      pending={pending}
    />
  );
}
