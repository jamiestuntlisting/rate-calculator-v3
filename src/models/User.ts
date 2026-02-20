import mongoose, { Schema, type Document } from "mongoose";

const UserSchema = new Schema(
  {
    // StuntListing's internal user ID — the canonical link between systems
    stuntlistingUserId: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    tier: {
      type: String,
      enum: ["free", "standard", "plus"],
      default: "free",
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    lastLogin: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });
UserSchema.index({ stuntlistingUserId: 1 }, { unique: true });

export interface IUser extends Document {
  stuntlistingUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: "free" | "standard" | "plus";
  role: "user" | "admin";
  lastLogin: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Always re-register to avoid stale schema in dev mode
if (mongoose.models.User) {
  mongoose.deleteModel("User");
}

export default mongoose.model<IUser>("User", UserSchema);
