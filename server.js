import express from "express";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(cors());

const PORT = 1234;

const httpServer = app.listen(PORT, () => {
    console.log(`🚀 Server is running http://localhost:${PORT}`);
});

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

io.on("connection", (socket) => {
    console.log("✅ A user connected", socket.id);

    // Create Room
    socket.on("create-room", (data, callback) => {
        const { roomId } = data || {};
        if (!roomId) {
            return callback?.({ success: false, error: "Room ID is required" });
        }

        socket.join(roomId);
        console.log(`📦 Room created: ${roomId} by ${socket.id}`);

        callback?.({ success: true, roomId });
        io.to(roomId).emit("room-created", roomId);
    });

    // Join Room
    socket.on("join-room", (data, callback) => {
        const { roomId } = data || {};
        if (!roomId) {
            return callback?.({ success: false, error: "Room ID is required" });
        }

        socket.join(roomId);
        console.log(`👤 User ${socket.id} joined room ${roomId}`);

        callback?.({ success: true, roomId });
        io.to(roomId).emit("room-joined", roomId);
    });

    // Code Change
    socket.on("code-change", ({ roomId, code }) => {
        if (roomId) {
            socket.to(roomId).emit("code-update", code);
        }
    });

    // Disconnect
    socket.on("disconnect", () => {
        console.log("❌ User disconnected:", socket.id);
    });
});

// Health Check
app.use("/keep-alive", (req, res) => {
    res.status(200).send({ status: "ok" });
});

app.get("/", (req, res) => {
    res.send("👋 Welcome To The Code Editor Backend Service");
});
