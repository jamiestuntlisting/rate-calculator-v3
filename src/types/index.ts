import type { RateSchedule } from "@/lib/rate-constants";

// ---- Document Attachment ----

export type DocumentType =
  | "exhibit_g"
  | "call_sheet"
  | "contract"
  | "wardrobe_photo"
  | "paystub"
  | "timecard"
  | "other";

export interface WorkDocument {
  filename: string; // UUID filename on disk
  originalName: string;
  documentType: DocumentType;
  uploadedAt: string; // ISO date string
  /**
   * Quarter turns clockwise, 0-270. A G photographed sideways is turned
   * here rather than re-encoded, and the stored file is never touched;
   * `documents` is a JSON column, so this needed no migration.
   */
  rotation?: number;
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  exhibit_g: "Exhibit G",
  call_sheet: "Call Sheet",
  contract: "Contract",
  wardrobe_photo: "Wardrobe Photo",
  paystub: "Paystub",
  timecard: "Timecard",
  other: "Other",
};

// ---- Other Work Category ----

export type OtherWorkCategory = "commercial" | "music_video" | "low_budget" | "other";

export const OTHER_WORK_CATEGORY_LABELS: Record<OtherWorkCategory, string> = {
  commercial: "Commercial",
  music_video: "Music Video",
  low_budget: "Low Budget",
  other: "Other",
};

// ---- Work Type ----

export type WorkType = "sag_aftra" | "other";

// ---- Record Status ----

export type RecordStatus = "complete" | "needs_times" | "draft" | "attachment_only";

// ---- Calculation types (from the shared rate-calculator package) ----

import type {
  ExhibitGInput,
  CalculationBreakdown,
} from "@/lib/rate-calculator";

export type {
  ExhibitGInput,
  TimeSegment,
  MealPenalty,
  CalculationBreakdown,
} from "@/lib/rate-calculator";

// ---- Payment Status ----

export type PaymentStatus =
  | "unpaid"
  | "paid_correctly"
  | "underpaid"
  | "overpaid"
  | "late";

// ---- Work Record (saved to DB) ----

export interface WorkRecord {
  _id: string;
  workType?: WorkType;
  otherWorkCategory?: OtherWorkCategory;
  showName: string;
  workDate: string;
  callTime?: string;
  dismissOnSet?: string;
  dismissMakeupWardrobe: string | null;
  ndMealIn: string | null;
  ndMealOut: string | null;
  firstMealStart: string | null;
  firstMealFinish: string | null;
  secondMealStart: string | null;
  secondMealFinish: string | null;
  stuntAdjustment: number;
  /**
   * Contracts worked that day, including the one calculated in full. Each
   * one past the first adds a day rate minimum — see lib/multi-contract.ts.
   */
  contracts?: number;
  /** Episodes inside a weekly guarantee, so extra contracts do not stack. */
  multipleEpisodeWeekly?: boolean;
  forcedCall: boolean;
  isSixthDay: boolean;
  isSeventhDay: boolean;
  isHoliday: boolean;
  /** A schedule, or an app-level flat agreement ("commercial", "flat_deal"). */
  workStatus: (RateSchedule | (string & {})) | null;
  /** A negotiated day rate instead of the schedule's — a flat deal. */
  flatDayRate?: number | null;
  /** The day belongs to a weekly contract; its money comes from the week. */
  weeklyContract?: boolean;
  /** daily | three_day | weekly — how long the deal runs. */
  contractLength?: "daily" | "three_day" | "weekly";
  /** Which 3-day figure the show's format pays: "short" (½ & 1-hr) or "long". */
  threeDayLength?: "short" | "long" | null;
  /** The saved weekly this day is grouped under in the tracker. */
  weeklyId?: string | null;
  characterName: string;
  notes: string;
  recordStatus: RecordStatus;
  documents: WorkDocument[];
  calculation?: CalculationBreakdown;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  paidDate: string | null;
  expectedAmount?: number;
  paymentDueDate: string | null;
  missingExhibitG?: boolean;
  photos: string[];
  createdAt: string;
  updatedAt: string;
}

// ---- API Response Types ----

export interface CalculateResponse {
  calculationId: string;
  input: ExhibitGInput;
  breakdown: CalculationBreakdown;
  documents?: WorkDocument[];
}

export interface WorkRecordListResponse {
  records: WorkRecord[];
  total: number;
  page: number;
  pages: number;
}
