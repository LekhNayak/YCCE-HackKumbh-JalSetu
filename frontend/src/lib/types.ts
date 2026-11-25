import type { Lang } from "./langs";
export type { Lang };

export type Role = "resident" | "society_admin" | "ward_officer";
export type Text3 = Record<Lang, string>;

export interface User {
  id: number; name: string; role: Role; lang: Lang; society_id: number | null; society: string | null;
  ward_id: number; blurb: Text3 | null; is_demo: boolean;
}

export interface Meta {
  app: string; today: string; languages: Lang[];
  features: { chat: "groq" | "guide"; speech: boolean; speech_languages: string[]; whatsapp: "twilio" | "simulated" };
  data: {
    built: string;
    wells: { count: number; cgwb: number; gsda: number; last_date: string };
    district_series_last_date: string;
    rain: { last_date: string; default_annual_mm: number };
    forecast: { issue_date: string; data_version: string };
    sources: string[];
  } | null;
}

export interface Horizon {
  target_date: string; q10: number; q50: number; q90: number; change_m: number; change_q10_m: number; change_q90_m: number;
  depth_q10: number; depth_q50: number; depth_q90: number; direction: "falling" | "rising" | "steady" | "uncertain";
}

export interface Outlook {
  district: string; engine: string; issue_date: string; data_version: string; level_now_m: number; depth_now_m: number;
  horizons: Partial<Record<"t+7" | "t+14" | "t+30", Horizon>>; stale: boolean;
  accuracy: Partial<Record<"t+7" | "t+14" | "t+30", { error_vs_no_change: number; mae_m: number; coverage_pct: number }>>;
}

export interface Alert {
  id: number; kind: string; level: "info" | "warn" | "good"; text: Text3; channel: string; status: "simulated" | "sent" | "failed";
  society_id: number | null; ward_id: number | null; created_at: string; is_demo: boolean;
}

export interface Trip {
  id: number; society_id: number; scheduled_at: string; capacity_l: number; source: string; arrived_at: string | null;
  status: "scheduled" | "on_time" | "late" | "missed" | "cancelled"; is_demo: boolean;
}

export interface SupplyDay { day: string; state: "came" | "none" | "unknown"; hours: number | null; n: number; demo: boolean }

export interface Society {
  id: number; name: string; ward_id: number; lat: number; lon: number; households: number; roof_area_m2: number;
  danger_depth_m: number; is_demo: boolean;
}

export interface Dashboard {
  society: Society; today: string;
  my_log_today: { came: boolean; hours: number | null } | null;
  supply: { last_30: SupplyDay[]; water_days_pct: number | null };
  tankers: { next: Trip | null; on_time_pct: number | null; counts: { on_time: number; late: number; missed: number } };
  borewell: { latest: { day: string; depth_m: number; status: string } | null; danger_depth_m: number };
  outlook: Outlook; warnings: { kind: string; level: string; params: Record<string, number | string> }[];
  alerts: Alert[]; rwh: { checks_total: number; checks_done: number }; savings_30d_l: number;
}

export interface WellLite {
  code: string; agency: "CGWB" | "GSDA"; name: string; village: string | null; lat: number; lon: number; km: number;
  first: string; last: string; latest_m: number; weekly: [string, number][]; daily_recent: [string, number][];
}

export interface Reading {
  id: number; day: string; depth_m: number; status: "accepted" | "flagged" | "baseline"; z: number | null; reasons: string[];
  detail: { window_days?: number; change_m?: number; expected_change_m?: number; sigma_m?: number; note?: string;
            wells?: { code: string; name: string; agency: string; km: number; change_m: number; window_end: string }[];
            forecast_change_range_m?: [number, number] };
  user_id: number; is_demo: boolean;
}

export interface Ticket {
  id: number; category: string; note: string; lat: number; lon: number; status: "open" | "assigned" | "in_progress" | "resolved";
  photo: string | null; ward_id: number | null; society_id: number | null; reporter_id: number; created_at: string;
  updated_at: string; resolved_at: string | null; history: { status: string; at: string; by: number }[];
  sla: { age_hours: number; escalated: boolean; sla_hours: number }; is_demo: boolean; routed_to?: Text3 | null;
}

export type ChatAction = { type: "navigate"; route: string } | { type: "highlight"; element: string };
