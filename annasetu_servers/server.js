const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");


const envPath = path.join(__dirname, ".env");
const result = dotenv.config({ path: envPath });
const connectDB = require("./config/db");
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');

const PORT = process.env.PORT || 5000;

let io;

const startServer = async () => {
  try {
    await connectDB();
    const httpServer = http.createServer(app);
    io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Socket.io connection
    io.on('connection', (socket) => {
      console.log('A user connected:', socket.id);
      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
      });
    });

    // Make io accessible in routes/controllers
    app.set('io', io);

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();