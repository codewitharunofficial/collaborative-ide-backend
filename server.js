import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import connectDB from "./DB/mongoDB.js";
import "dotenv/config";
import User from "./Models/User.js";
import Project from "./Models/Project.js";

const app = express();
app.use(cors());

const PORT = 1234;

connectDB();

const httpServer = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
});

// ✅ Recursive file tree builder (with file contents)
const buildFileTree = (dir, base = dir) => {
    const items = [];
    if (!fs.existsSync(dir)) return items;

    const files = fs.readdirSync(dir);
    for (let file of files) {
        // Skip heavy/unnecessary directories
        if (["node_modules", ".git", ".next", "dist", "build"].includes(file)) {
            continue;
        }

        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            items.push({
                name: file,
                path: path.relative(base, fullPath),
                type: "folder",
                children: buildFileTree(fullPath, base),
            });
        } else {
            // Decide whether to include content
            const ext = path.extname(file).toLowerCase();
            const textFileExts = [
                ".js", ".ts", ".jsx", ".tsx",
                ".json", ".md", ".html", ".css", ".txt"
            ];

            let content = "";
            if (textFileExts.includes(ext) && stat.size < 1024 * 500) { // only if < 500KB
                try {
                    content = fs.readFileSync(fullPath, "utf-8");
                } catch (err) {
                    console.error("Error reading file:", fullPath, err.message);
                }
            }

            items.push({
                name: file,
                path: path.relative(base, fullPath),
                type: "file",
                content, // ✅ save content only for text-based files
            });
        }
    }
    return items;
};



io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("user-auth", async ({ user, expiresAt }) => {
        if (user && user.email) {
            let theUser = await User.findOne({ email: user?.email });

            if (!theUser) {
                console.log("No Such User In DB");
                theUser = new User({
                    name: user?.name,
                    email: user?.email,
                    picture: user?.image,
                    expiresAt,
                });
                await theUser.save();
            } else {
                console.log("User already exists in DB");
            }

            socket.emit("successful-auth", { user: theUser });
        }
    });

    // ✅ rooms
    socket.on("create-room", ({ roomId }) => {
        socket.join(roomId);
        socket.emit("room-created", { success: true });
    });

    socket.on("join-room", ({ roomId }) => {
        socket.join(roomId);
        socket.emit("room-joined", { success: true });
    });

    // ✅ code sync
    socket.on("code-change", ({ roomId, code }) => {
        socket.to(roomId).emit("code-update", code);
    });

    socket.on("language-change", ({ roomId, language }) => {
        io.to(roomId).emit("language-update", language);
    });

    // ✅ terminal commands
    socket.on("terminal-command", ({ roomId, command }) => {
        exec(command, { timeout: 5000 }, (err, stdout, stderr) => {
            const output = stdout || stderr || (err ? err.message : "No output");
            io.to(roomId).emit("terminal-output", { command, output });
        });
    });

    socket.on("get-file-content", ({ projectPath, relativePath }) => {
        try {
            const fullPath = path.join(projectPath, relativePath);
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, "utf-8");
                socket.emit("file-content", { path: relativePath, content });
            } else {
                socket.emit("file-content", { path: relativePath, content: "❌ File not found" });
            }
        } catch (err) {
            socket.emit("file-content", { path: relativePath, content: `❌ Error: ${err.message}` });
        }
    });


    socket.on("save-file", async ({ projectPath, relativePath, content }) => {
        try {
            const fullPath = path.join(projectPath, relativePath);
            fs.writeFileSync(fullPath, content, "utf-8");
            socket.emit("file-saved", { path: relativePath, success: true });
        } catch (err) {
            socket.emit("file-saved", { path: relativePath, success: false, error: err.message });
        }
    });

    // ✅ run JS code
    socket.on("run-js", ({ roomId, code }) => {
        const filePath = path.join(process.cwd(), `temp-${Date.now()}.js`);
        fs.writeFileSync(filePath, code);

        exec(`node "${filePath}"`, { timeout: 5000 }, (err, stdout, stderr) => {
            const output = stdout || stderr || (err ? err.message : "No output");

            io.to(roomId).emit("terminal-output", {
                command: "node script.js",
                output,
            });

            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) console.error("Cleanup error:", unlinkErr.message);
            });
        });
    });

    // ✅ clone repo & save to DB (with file contents)
    socket.on("clone-repo", async ({ roomId, repoUrl, email }) => {
        if (!repoUrl || !email) {
            socket.emit("terminal-output", {
                command: "git clone",
                output: "❌ Repo URL and email are required",
            });
            return;
        }

        const projectName = repoUrl.split("/").pop().replace(".git", "");
        const projectPath = path.join(process.cwd(), "projects", email, projectName);

        // Check DB first
        let project = await Project.findOne({ repoUrl, email });
        if (project) {
            console.log("✅ Found project in DB, sending cached files.");
            io.to(roomId).emit("project-loaded", { project, files: project.files });
            return;
        }

        console.log(`Cloning repo: ${repoUrl} into ${projectPath}`);

        exec(`git clone ${repoUrl} ${projectPath}`, async (err) => {
            if (err) {
                io.to(roomId).emit("terminal-output", {
                    command: "git clone",
                    output: `❌ Failed to clone repo: ${err.message}`,
                });
                return;
            }

            // build file tree with contents
            const fileTree = buildFileTree(projectPath);

            // save project
            project = new Project({
                email,
                name: projectName,
                repoUrl,
                path: projectPath,
                files: fileTree,
            });
            await project.save();

            console.log("✅ Repo cloned & saved:", project.name);

            io.to(roomId).emit("project-loaded", { project, files: fileTree });
        });
    });

    // ✅ fetch projects from DB
    socket.on("get-projects", async ({ email }) => {
        try {
            const projects = await Project.find({ email });
            socket.emit("projects-list", projects);
        } catch (err) {
            socket.emit("terminal-output", {
                command: "get-projects",
                output: `❌ Failed to fetch projects: ${err.message}`,
            });
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});
