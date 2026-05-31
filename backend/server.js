const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const ownerRoutes = require('./routes/owner');
const uploadRoutes = require('./routes/upload');
const pricingRoutes = require('./routes/pricing');
const previewRoutes = require('./routes/preview');
const { cleanupOrphanedFiles } = require('./services/fileCleanup');
const Order = require('./models/Order');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Redirect root to the landing page
app.get('/', (req, res) => res.redirect('/pages/index.html'));

app.set('io', io);

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected');

    // Create compound index for efficient queue queries
    try {
      await Order.collection.createIndex({ status: 1, createdAt: 1 });
      console.log('Database index { status: 1, createdAt: 1 } ensured');
    } catch (err) {
      console.error('Error creating database index:', err.message);
    }

    // Seed default owner account if not exists
    const User = require('./models/User');
    const existingOwner = await User.findOne({ email: 'owner@xerox.com' });
    if (!existingOwner) {
      await User.create({ name: 'Shop Owner', email: 'owner@xerox.com', password: 'owner123', role: 'owner' });
      console.log('Default owner account created: owner@xerox.com / owner123');
    }

    // Seed default pricing if not exists
    const Pricing = require('./models/Pricing');
    const existingPricing = await Pricing.findOne();
    if (!existingPricing) {
      await Pricing.create({});
      console.log('Default pricing created');
    }

    // Cleanup orphaned files on startup (fire and forget)
    cleanupOrphanedFiles().catch(err => {
      console.error('Error during orphaned file cleanup:', err.message);
    });
  })
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/upload', uploadRoutes);

// Serve files from MongoDB GridFS
app.get('/api/files/:fileName', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    const files = await bucket.find({ filename: req.params.fileName }).toArray();
    if (!files || files.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = files[0];
    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.set('Content-Length', file.length);
    bucket.openDownloadStreamByName(req.params.fileName).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.use('/api/pricing', pricingRoutes);
app.use('/api/preview', previewRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('join-order', (tokenId) => socket.join(`order-${tokenId}`));
  socket.on('join-owner', () => socket.join('owner-room'));
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = { io };
