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

// ---- Exhibit G Form Input ----

export interface ExhibitGInput {
  showName: string;
  workDate: string; // ISO date string "YYYY-MM-DD"
  callTime: string; // "HH:MM" 24hr
  reportMakeupWardrobe: string | null;
  dismissOnSet: string;
  dismissMakeupWardrobe: string | null;
  ndMealIn: string | null;
  ndMealOut: string | null;
  firstMealStart: string | null;
  firstMealFinish: string | null;
  secondMealStart: string | null;
  secondMealFinish: string | null;
  stuntAdjustment: number;
  forcedCall: boolean;
  isSixthDay: boolean;
  isSeventhDay: boolean;
  isHoliday: boolean;
  workStatus: RateSchedule;
  characterName: string;
  notes: string;
}

// ---- Calculation Result ----

export interface TimeSegment {
  label: string;
  hours: number;
  rate: number;
  multiplier: number;
  subtotal: number;
}

export interface MealPenalty {
  meal: string;
  minutesLate: number;
  amount: number;
}

export interface CalculationBreakdown {
  baseRate: number;
  hourlyRate: number;
  adjustedBaseRate: number;
  adjustedHourlyRate: number;
  totalWorkHours: number;
  totalMealTime: number;
  netWorkHours: number;
  segments: TimeSegment[];
  penalties: {
    mealPenalties: MealPenalty[];
    forcedCallPenalty: number;
    totalPenalties: number;
  };
  dayMultiplier: {
    applied: boolean;
    type: "6th_day" | "7th_day" | "holiday" | null;
    multiplier: number;
  };
  grandTotal: number;
}

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
  reportMakeupWardrobe: string | null;
  dismissOnSet?: string;
  dismissMakeupWardrobe: string | null;
  ndMealIn: string | null;
  ndMealOut: string | null;
  firstMealStart: string | null;
  firstMealFinish: string | null;
  secondMealStart: string | null;
  secondMealFinish: string | null;
  stuntAdjustment: number;
  forcedCall: boolean;
  isSixthDay: boolean;
  isSeventhDay: boolean;
  isHoliday: boolean;
  workStatus: RateSchedule | null;
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
