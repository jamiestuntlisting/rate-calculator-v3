import mongoose, { Schema, type Document } from "mongoose";

const ResidualCheckSchema = new Schema(
  {
    sagAftraId: { type: String },
    payeeName: { type: String },
    payeeType: { type: String },
    company: { type: String },
    payrollHouse: { type: String },
    productionTitle: { type: String, required: true },
    checkStatus: { type: String },
    checkStatusDate: { type: String },
    checkNumber: { type: String },
    checkDate: { type: String },
    grossAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    receivedDate: { type: String },
    donated: { type: String },
    prodTitleGrossAmt: { type: Number, default: 0 },
  },
  { _id: true }
);

const ResidualImportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    performerName: { type: String, required: true },
    filename: { type: String, required: true },
    totalChecks: { type: Number, default: 0 },
    totalGross: { type: Number, default: 0 },
    checks: [ResidualCheckSchema],
  },
  { timestamps: true }
);

ResidualImportSchema.index({ performerName: 1 });
ResidualImportSchema.index({ "checks.productionTitle": 1 });

export interface IResidualCheck {
  _id: string;
  sagAftraId: string;
  payeeName: string;
  payeeType: string;
  company: string;
  payrollHouse: string;
  productionTitle: string;
  checkStatus: string;
  checkStatusDate: string;
  checkNumber: string;
  checkDate: string;
  grossAmount: number;
  netAmount: number;
  receivedDate: string;
  donated: string;
  prodTitleGrossAmt: number;
}

export interface IResidualImport extends Document {
  userId: mongoose.Types.ObjectId;
  performerName: string;
  filename: string;
  totalChecks: number;
  totalGross: number;
  checks: IResidualCheck[];
  createdAt: Date;
  updatedAt: Date;
}

// Always re-register to avoid stale schema in dev mode
if (mongoose.models.ResidualImport) {
  mongoose.deleteModel("ResidualImport");
}

export default mongoose.model<IResidualImport>(
  "ResidualImport",
  ResidualImportSchema
);
