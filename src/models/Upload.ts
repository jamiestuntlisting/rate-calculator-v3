import mongoose, { Schema, type Document } from "mongoose";

export interface IUpload extends Document {
  filename: string;
  originalName: string;
  contentType: string;
  data: Buffer;
  size: number;
  createdAt: Date;
}

const UploadSchema = new Schema({
  filename: { type: String, required: true, unique: true, index: true },
  originalName: { type: String, required: true },
  contentType: { type: String, required: true },
  data: { type: Buffer, required: true },
  size: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

if (mongoose.models.Upload) {
  mongoose.deleteModel("Upload");
}

export default mongoose.model<IUpload>("Upload", UploadSchema);
