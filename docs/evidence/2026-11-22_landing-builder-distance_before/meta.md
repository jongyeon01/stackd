# 홈 → 빌더 도달 거리 (before — 카드 쇼케이스 제거 전)

- **대상**: 홈(`/`)의 섹션별 세로 위치와 빌더 첫 입력칸까지의 거리
- **확인한 값**
  | 뷰포트 | 빌더 첫 입력칸 top | 화면 수 (top ÷ innerHeight) | 페이지 전체 높이 |
  |---|---|---|---|
  | 데스크톱 1440×900 | 3563px | 3.96 | 4560px |
  | 모바일 390×844 (DPR 3, mobile·touch) | 5244px | 6.21 | 6336px |
  - 카드 쇼케이스(`aria-label="카드 실물 보기"`) 높이: 데스크톱 893px / 모바일 683px
- **확인 방법**: chrome-devtools MCP `evaluate_script` — 페이지를 끝까지 스크롤해 리빌을 발화시킨 뒤 `main > section`의 `getBoundingClientRect().top + scrollY`와 `#builder`의 첫 `input/textarea` 위치를 측정 (`raw-desktop.json`, `raw-mobile.json`). `capture.png`는 데스크톱 전체 페이지 캡처
- **확인 일시**: 2026-11-22 20:40 KST (raw의 `measuredAt`은 UTC)
- **환경**: https://stackd.kr/ (프로덕션), main `35cfd1d`. isolated 브라우저 컨텍스트, initScript로 `gtag`·`dataLayer`·`clarity`를 no-op 처리해 GA4·Clarity 집계 오염 방지
- **반영한 산출물**: `docs/prd/SCR-001_홈.md` v3.2.0 변경 노트, `docs/history.md` 2026-11-22 항목
