// GA4 이벤트 발화 (PRD-15 EVT SSOT) — 실패는 침묵, 트래킹이 UX를 막지 않는다

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void;
  }
}

// 커스텀 이벤트는 이 10종이 전부 (PRD-15 v3). 타입으로 오타를 막는다
export type GaEvent =
  | "step_add" // EVT-BLDR-001
  | "card_create" // EVT-CARD-001 (H-01)
  | "card_preview" // EVT-CARD-002
  | "card_edit" // EVT-CARD-003
  | "card_share" // EVT-SHARE-001 (H-02)
  | "card_reshare" // EVT-SHARE-002
  | "login" // EVT-AUTH-001
  | "prompt_copy" // EVT-WF-001 (2.0)
  | "workflow_fork" // EVT-WF-002 — stage: gate|done
  | "workflow_bookmark"; // EVT-WF-003 — stage: gate|done

type GaParams = Record<string, string | number | boolean>;

// PII 금지 — 핸들·이메일·제목·상황 텍스트는 파라미터로 보내지 않는다 (PRD-15)
export function track(event: GaEvent, params?: GaParams) {
  window.gtag?.("event", event, params);
}
