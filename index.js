require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const { Server } = require("socket.io");
const http = require("http");

const { buildCorsOptions, getAllowedOrigins } = require("./src/config/cors");

// Middlewares
const loggerMiddleware = require("./src/middleware/loggerMiddleware");
const errorMiddleware = require("./src/middleware/errorMiddleware");

const app = express();

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// --------------------
// 🔧 CORS CONFIGURATION
// --------------------

// Define allowed origins
const allowedOrigins = getAllowedOrigins();

// Setup Socket.io CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// Middleware to attach `io` to requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

// JSON limit
app.use(express.json({ limit: "1mb" }));

// Security headers
app.use(helmet());

// Proper CORS middleware (no wildcard + credentials-safe)
app.use(cors(buildCorsOptions()));

// Ensure preflight requests always succeed when origin is allowed
app.options(/.*/, cors(buildCorsOptions()));

// Custom logger
app.use(loggerMiddleware);

// --------------------
// 🌐 ROUTES
// --------------------

app.get("/", (req, res) => {
  res.send("Welcome to Annapur Backend!");
});

// --------------------
// 📁 IMAGE UPLOAD SETUP
// --------------------

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

// 🧩 API ROUTES

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

// Error handler
app.use(errorMiddleware);

module.exports = { app, server, io };
