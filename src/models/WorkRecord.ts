import mongoose, { Schema, type Document } from "mongoose";

const TimeSegmentSchema = new Schema(
  {
    label: { type: String, required: true },
    hours: { type: Number, required: true },
    rate: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const MealPenaltySchema = new Schema(
  {
    meal: { type: String, required: true },
    minutesLate: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const PenaltiesSchema = new Schema(
  {
    mealPenalties: [MealPenaltySchema],
    forcedCallPenalty: { type: Number, default: 0 },
    totalPenalties: { type: Number, default: 0 },
  },
  { _id: false }
);

const DayMultiplierSchema = new Schema(
  {
    applied: { type: Boolean, default: false },
    type: {
      type: String,
      enum: ["6th_day", "7th_day", "holiday", null],
      default: null,
    },
    multiplier: { type: Number, default: 1.0 },
  },
  { _id: false }
);

const CalculationBreakdownSchema = new Schema(
  {
    baseRate: { type: Number, required: true },
    hourlyRate: { type: Number, required: true },
    adjustedBaseRate: { type: Number, required: true },
    adjustedHourlyRate: { type: Number, required: true },
    totalWorkHours: { type: Number, required: true },
    totalMealTime: { type: Number, required: true },
    netWorkHours: { type: Number, required: true },
    segments: [TimeSegmentSchema],
    penalties: PenaltiesSchema,
    dayMultiplier: DayMultiplierSchema,
    grandTotal: { type: Number, required: true },
  },
  { _id: false }
);

const WorkDocumentSchema = new Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    documentType: {
      type: String,
      enum: ["exhibit_g", "call_sheet", "contract", "wardrobe_photo", "paystub", "timecard", "other"],
      default: "other",
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const WorkRecordSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    workType: {
      type: String,
      enum: ["sag_aftra", "other"],
      default: "sag_aftra",
    },
    otherWorkCategory: {
      type: String,
      enum: ["commercial", "music_video", "low_budget", "other", null],
      default: null,
    },
    showName: { type: String, required: true },
    workDate: { type: Date, required: true },
    callTime: { type: String, default: null },
    dismissOnSet: { type: String, default: null },
    dismissMakeupWardrobe: { type: String, default: null },
    ndMealIn: { type: String, default: null },
    ndMealOut: { type: String, default: null },
    firstMealStart: { type: String, default: null },
    firstMealFinish: { type: String, default: null },
    secondMealStart: { type: String, default: null },
    secondMealFinish: { type: String, default: null },
    stuntAdjustment: { type: Number, default: 0 },
    forcedCall: { type: Boolean, default: false },
    isSixthDay: { type: Boolean, default: false },
    isSeventhDay: { type: Boolean, default: false },
    isHoliday: { type: Boolean, default: false },
    workStatus: {
      type: String,
      enum: ["theatrical_basic", "television", "stunt_coordinator", null],
      default: null,
    },
    characterName: { type: String, default: "" },
    notes: { type: String, default: "" },
    recordStatus: {
      type: String,
      enum: ["complete", "needs_times", "draft", "attachment_only"],
      default: "complete",
    },
    documents: [WorkDocumentSchema],
    calculation: { type: CalculationBreakdownSchema, default: null },
    paymentStatus: {
      type: String,
      enum: [
        "unpaid",
        "paid_correctly",
        "underpaid",
        "overpaid",
        "late",
      ],
      default: "unpaid",
    },
    paidAmount: { type: Number, default: 0 },
    paidDate: { type: Date, default: null },
    expectedAmount: { type: Number, default: 0 },
    paymentDueDate: { type: Date, default: null },
    missingExhibitG: { type: Boolean, default: false },
    photos: [{ type: String }],
  },
  { timestamps: true }
);

WorkRecordSchema.index({ workDate: -1 });
WorkRecordSchema.index({ showName: 1 });
WorkRecordSchema.index({ paymentStatus: 1 });
WorkRecordSchema.index({ recordStatus: 1 });

export interface IWorkRecord extends Document {
  userId: mongoose.Types.ObjectId;
  workType: string;
  otherWorkCategory: string | null;
  showName: string;
  workDate: Date;
  callTime: string | null;
  dismissOnSet: string | null;
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
  workStatus: string;
  characterName: string;
  notes: string;
  recordStatus: string;
  documents: Array<{
    filename: string;
    originalName: string;
    documentType: string;
    uploadedAt: Date;
  }>;
  calculation: {
    baseRate: number;
    hourlyRate: number;
    adjustedBaseRate: number;
    adjustedHourlyRate: number;
    totalWorkHours: number;
    totalMealTime: number;
    netWorkHours: number;
    segments: Array<{
      label: string;
      hours: number;
      rate: number;
      multiplier: number;
      subtotal: number;
    }>;
    penalties: {
      mealPenalties: Array<{
        meal: string;
        minutesLate: number;
        amount: number;
      }>;
      forcedCallPenalty: number;
      totalPenalties: number;
    };
    dayMultiplier: {
      applied: boolean;
      type: string | null;
      multiplier: number;
    };
    grandTotal: number;
  } | null;
  paymentStatus: string;
  paidAmount: number;
  paidDate: Date | null;
  expectedAmount: number;
  paymentDueDate: Date | null;
  missingExhibitG: boolean;
  photos: string[];
  createdAt: Date;
  updatedAt: Date;
}

// In dev mode, Next.js HMR can cache a stale model with an outdated schema.
// Always delete and re-register to ensure schema changes take effect.
if (mongoose.models.WorkRecord) {
  mongoose.deleteModel("WorkRecord");
}

export default mongoose.model<IWorkRecord>("WorkRecord", WorkRecordSchema);
