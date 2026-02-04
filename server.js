require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const { buildCorsOptions, getAllowedOrigins } = require("./src/config/cors");

const connectDB = require("./src/config/db");
const User = require("./src/models/User");

const app = express();

/* -------------------- BASIC MIDDLEWARE -------------------- */

app.use(express.json());
app.use(helmet());

/* -------------------- CORS CONFIG -------------------- */

const allowedOrigins = getAllowedOrigins();

app.use(cors(buildCorsOptions()));

// VERY IMPORTANT for preflight
app.options(/.*/, cors(buildCorsOptions()));

/* -------------------- SERVER -------------------- */

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

/* -------------------- SOCKET.IO -------------------- */

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// Attach io to requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

/* -------------------- HEALTH CHECK -------------------- */

app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

/* -------------------- SOCKET AUTH -------------------- */

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

/* -------------------- SOCKET EVENTS -------------------- */

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

/* -------------------- START SERVER -------------------- */

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
