import express from "express";
import cors from "cors";
import { Server } from "socket.io"; // Fixed import (was "socket-io")

const app = express();
app.use(cors());

const PORT = 1234

const httpServer = app.listen(PORT, () => {
    console.log(`Server is running http://localhost:${PORT}`);
});

// Pass the HTTP server to Socket.IO
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});


io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    socket.on("create-room", (roomId) => {
        socket.join(roomId);
        console.log(`Room created: ${roomId} by ${socket.id}`);
        socket.emit("room-created", roomId);
    });

    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
        socket.emit("room-joined", roomId);
    });

    socket.on("code-change", ({ roomId, code }) => {
        socket.to(roomId).emit("code-update", code);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});


app.use('/keep-alive', (req, res) => {
    res.status(200).send({ status: 'ok' })
});


app.get('/', (req, res) => {
    res.send('Welcome To The Code Editor Backend Service');
});