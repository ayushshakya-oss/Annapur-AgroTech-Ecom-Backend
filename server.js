require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const connectDB = require("./src/config/db");
const User = require("./src/models/User");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  },
});

// Inject io into requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Health check (IMPORTANT for Render)
app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

// Socket.IO authentication
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Token missing"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) return next(new Error("User not found"));

    socket.user = user;
    next();
  } catch (err) {
    next(new Error("Authentication failed"));
  }
});

// Socket.IO events
io.on("connection", (socket) => {
  console.log("User connected:", socket.user?.email);

  socket.on("joinNegotiation", (negotiationId) => {
    socket.join(negotiationId);
  });

  socket.on("registerUser", () => {
    if (socket.user?._id) {
      socket.join(`user_${socket.user._id}`);
    }
  });

  socket.on("newBid", (data) => {
    io.to(data.negotiationId).emit("bidUpdate", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// Start server ONLY ONCE
(async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();
