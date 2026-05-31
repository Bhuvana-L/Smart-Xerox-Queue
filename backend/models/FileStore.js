const mongoose = require('mongoose');

const fileStoreSchema = new mongoose.Schema({
  fileName: { type: String, required: true, unique: true },
  originalName: { type: String },
  contentType: { type: String },
  size: { type: Number },
  data: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FileStore', fileStoreSchema);
