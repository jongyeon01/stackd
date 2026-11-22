# 홈 → 빌더 도달 거리 (after — 카드 쇼케이스 제거 후)

- **대상**: 홈(`/`)의 섹션별 세로 위치와 빌더 첫 입력칸까지의 거리. before: `../2026-11-22_landing-builder-distance_before/`
- **확인한 값**
  | 뷰포트 | 빌더 첫 입력칸 top | 화면 수 | 페이지 전체 높이 | before 대비 |
  |---|---|---|---|---|
  | 데스크톱 1440×900 | 2670px | 2.97 | 3667px | −893px (3.96 → 2.97) |
  | 모바일 390×844 (DPR 3, mobile·touch) | 4561px | 5.40 | 5653px | −683px (6.21 → 5.40) |
  - h1 1개, 가로 스크롤 없음(두 뷰포트). 콘솔 오류 0건(issue 1종 "form field id/name" ×2는 빌더 기존 항목, 이번 변경 무관)
- **확인 방법**: before와 같은 스크립트(chrome-devtools MCP `evaluate_script`, 끝까지 스크롤 후 측정). `capture.png` = 데스크톱 전체 페이지
- **확인 일시**: 2026-11-22 KST
- **환경**: http://localhost:3002/ (`npm run dev`, Next dev), 브랜치 `refactor/remove-home-showcase` (미커밋 작업 트리, base `35cfd1d`)
- **반영한 산출물**: `docs/history.md` 2026-11-22 항목
