import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import connectDB from "./DB/mongoDB.js";
import "dotenv/config";
import User from "./Models/User.js";

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

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("user-auth", async ({ user, expiresAt }) => {
        if (user && user.email) {
            const theUser = await User.findOne({ email: user?.email });

            if (!theUser) {
                console.log("No Such User In DB");
                const newUser = new User({
                    name: user?.name,
                    email: user?.email,
                    picture: user?.image,
                    expiresAt,
                });
                await newUser.save();

                socket.emit("successful-auth", { user: newUser });
            } else {
                console.log("User already exists in DB");
                socket.emit("successful-auth", { user: theUser });
            }
        }
    });

    socket.on("create-room", ({ roomId }) => {
        socket.join(roomId);
        console.log(`Room created: ${roomId} by ${socket.id}`);
        socket.emit("room-created", { success: true });
    });


    socket.on("join-room", ({ roomId }) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
        socket.emit("room-joined", { success: true });
    });

  
    socket.on("code-change", ({ roomId, code }) => {
        console.log(`Code update in ${roomId} from ${socket.id}`);
        socket.to(roomId).emit("code-update", code);
    });


    socket.on("language-change", ({ roomId, language }) => {
        console.log(`Language changed to ${language} in ${roomId}`);
        io.to(roomId).emit("language-update", language);
    });


    socket.on("terminal-command", ({ roomId, command }) => {
        console.log(`Command from ${socket.id} in ${roomId}: ${command}`);
        exec(command, { timeout: 5000 }, (err, stdout, stderr) => {
            const output = stdout || stderr || (err ? err.message : "No output");
            io.to(roomId).emit("terminal-output", { command, output });
        });
    });


    socket.on("run-js", ({ roomId, code }) => {
        console.log(`Running JS code in ${roomId} from ${socket.id}`);

        const filePath = path.join(process.cwd(), `temp-${Date.now()}.js`);
        fs.writeFileSync(filePath, code);

        exec(`node "${filePath}"`, { timeout: 5000 }, (err, stdout, stderr) => {
            const output = stdout || stderr || (err ? err.message : "No output");

            io.to(roomId).emit("terminal-output", {
                command: "node script.js",
                output,
            });

            // cleanup temp file
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) console.error("Cleanup error:", unlinkErr.message);
            });
        });
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});
