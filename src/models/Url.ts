import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUrl extends Document {
  originalUrl: string;
  shortCode: string;
  clicks: number;
  createdAt: Date;
  updatedAt: Date;
}

const UrlSchema = new Schema<IUrl>(
  {
    originalUrl: {
      type: String,
      required: [true, "A URL original é obrigatória"],
      trim: true,
    },
    shortCode: {
      type: String,
      required: true,
      unique: true, 
      index: true,  
    },
    clicks: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, 
  }
);

//Reutiliza o model se já registrado, evita OverwriteModelError no hot reload
const Url: Model<IUrl> =
  mongoose.models.Url || mongoose.model<IUrl>("Url", UrlSchema);

export default Url;