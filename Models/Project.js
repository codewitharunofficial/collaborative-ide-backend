import mongoose from "mongoose";

const FileSchema = new mongoose.Schema({
    name: { type: String, required: true },
    path: { type: String, required: true },
    type: { type: String, enum: ["file", "folder"], required: true },
    content: { type: String },
    children: [{ type: mongoose.Schema.Types.Mixed }],
});


const ProjectSchema = new mongoose.Schema({
    email: { type: String, required: true }, // use email instead of userId
    name: { type: String, required: true },
    repoUrl: { type: String },
    path: { type: String, required: true },
    files: [FileSchema],
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Project", ProjectSchema);
