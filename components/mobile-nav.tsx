"use client";

import { useState } from "react";
import Link from "next/link";
import { NAV } from "@/lib/site";
import { MenuIcon } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// lg 미만 내비 — 링크는 데스크톱 nav에 서버 렌더로 존재하고 여기선 좁은 화면용 재배치다
// 클라이언트인 이유는 시트 개폐 상태 하나뿐 (CLAUDE.md "use client 최소화")
export default function MobileNav({ handle }: { handle?: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const item =
    "rounded-md px-2 py-3 text-base text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label="메뉴 열기">
          <MenuIcon />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-72 gap-0 px-4 pt-4 pb-6">
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">메뉴</SheetTitle>
        </SheetHeader>

        <nav aria-label="모바일 주요" className="mt-8 flex flex-col">
          {NAV.filter((n) => !n.auth || handle).map((n) => (
            <Link key={n.href} href={n.href} onClick={close} className={item}>
              {n.label}
            </Link>
          ))}

          {handle && (
            <>
              <Link href="/settings" onClick={close} className={item}>
                설정
              </Link>
              {/* @핸들은 설정과 같은 곳으로 간다 — 계정 확인용이라 구분선 아래 */}
              <Link
                href="/settings"
                onClick={close}
                className={`${item} mt-4 border-t border-border pt-4 font-mono text-sm`}
              >
                @{handle}
              </Link>
              <form action={signOut} className="mt-1">
                <Button
                  type="submit"
                  variant="ghost"
                  size="lg"
                  className="w-full justify-start px-2 font-normal text-muted-foreground"
                >
                  로그아웃
                </Button>
              </form>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
