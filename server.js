import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { exec } from "child_process";
import connectDB from "./DB/mongoDB.js";
import 'dotenv/config';

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

    // ✅ Create room
    socket.on("create-room", ({ roomId }) => {
        socket.join(roomId);
        console.log(`Room created: ${roomId} by ${socket.id}`);
        socket.emit("room-created", { success: true });
    });

    // ✅ Join room
    socket.on("join-room", ({ roomId }) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
        socket.emit("room-joined", { success: true });
    });

    // ✅ Code changes
    socket.on("code-change", ({ roomId, code }) => {
        console.log(`Code update in ${roomId} from ${socket.id}`);
        // broadcast to all in room except sender
        socket.to(roomId).emit("code-update", code);
    });

    // ✅ Language changes
    socket.on("language-change", ({ roomId, language }) => {
        console.log(`Language changed to ${language} in ${roomId}`);
        // broadcast to all in room
        io.to(roomId).emit("language-update", language);
    });

    // ✅ Terminal command event
    socket.on("terminal-command", ({ roomId, command }) => {
        console.log(`Command from ${socket.id} in ${roomId}: ${command}`);

        // Run the command (⚠️ consider sandboxing this later!)
        exec(command, { timeout: 5000 }, (err, stdout, stderr) => {
            const output = stdout || stderr || (err ? err.message : "No output");

            // Send result to ALL users in the room
            io.to(roomId).emit("terminal-output", {
                command,
                output,
            });
        });
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});
