require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const { buildCorsOptions, getAllowedOrigins } = require("./src/config/cors");

const loggerMiddleware = require("./src/middleware/loggerMiddleware");
const errorMiddleware = require("./src/middleware/errorMiddleware");

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

// Custom logger
app.use(loggerMiddleware);

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

/* -------------------- IMAGE UPLOAD + STATIC -------------------- */

const uploadDir = path.join(__dirname, "upload", "images");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, `product_${Date.now()}${path.extname(file.originalname)}`),
});

const upload = multer({ storage });

// Serve static images
app.use("/images", express.static(uploadDir));

// Upload endpoint
app.post("/upload", upload.single("product"), (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: false, error: "No file uploaded" });

  const imageUrl = `${req.protocol}://${req.get("host")}/images/${
    req.file.filename
  }`;
  res.json({
    success: true,
    image_url: imageUrl,
  });
});

/* -------------------- API ROUTES -------------------- */

app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/products", require("./src/routes/productRoutes"));
app.use("/api/users", require("./src/routes/userRoutes"));
app.use("/api/cart", require("./src/routes/cartRoutes"));
app.use("/api/orders", require("./src/routes/orderRoutes"));
app.use("/api/payment", require("./src/routes/paymentRoutes"));
app.use("/api/searches", require("./src/routes/searchRoutes"));
app.use("/api/bids", require("./src/routes/bidRoutes"));
app.use("/api/notifications", require("./src/routes/notificationRoutes"));
app.use("/api/negotiations", require("./src/routes/negotiationRoutes"));

// Error handler (keep last)
app.use(errorMiddleware);

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
