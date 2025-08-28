import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { exec } from "child_process"; // for terminal execution

const app = express();
app.use(cors());

const PORT = 1234;

const httpServer = app.listen(PORT, () => {
    console.log(`Server is running http://localhost:${PORT}`);
});

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    // ✅ Room Creation
    socket.on("create-room", ({ roomId }, callback) => {
        socket.join(roomId);
        console.log(`Room created: ${roomId} by ${socket.id}`);
        if (callback) callback({ success: true, roomId });
        socket.emit("room-created", roomId);
    });

    // ✅ Room Joining
    socket.on("join-room", ({ roomId }, callback) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
        if (callback) callback({ success: true, roomId });
        socket.emit("room-joined", roomId);
    });

    // ✅ Code Change
    socket.on("code-change", ({ roomId, code }) => {
        socket.to(roomId).emit("code-update", code);
    });

    // ✅ Terminal Command
    socket.on("terminal-command", ({ roomId, command }) => {
        console.log(`Room ${roomId} command: ${command}`);

        exec(command, (error, stdout, stderr) => {
            let output = stdout || stderr || (error ? error.message : "Unknown error");

            // emit result back only to the same room
            io.to(roomId).emit("terminal-output", output);
        });
    });

    socket.on("leave-room", ({ roomId }) => {
        socket.leave(roomId);
        console.log(`User ${socket.id} left room ${roomId}`);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

// ✅ Keep Alive
app.use("/keep-alive", (req, res) => {
    res.status(200).send({ status: "ok" });
});

app.get("/", (req, res) => {
    res.send("Welcome To The Code Editor Backend Service");
});
