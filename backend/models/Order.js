const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const pageRangeSchema = new mongoose.Schema({
  from: { type: Number, required: true },
  to: { type: Number, required: true },
  colorType: { type: String, enum: ['color', 'bw'], default: 'bw' },
  side: { type: String, enum: ['single', 'double', 'micro'], default: 'single' }
}, { _id: false });

const printSettingsSchema = new mongoose.Schema({
  mode: { type: String, enum: ['whole', 'page-range'], default: 'whole' },
  colorType: { type: String, enum: ['color', 'bw'], default: 'bw' },
  side: { type: String, enum: ['single', 'double', 'micro'], default: 'single' },
  copies: { type: Number, default: 1, min: 1 },
  totalPages: { type: Number, required: true },
  paperSize: { type: String, enum: ['A4', 'A3', 'Legal'], default: 'A4' },
  orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
  binding: { type: String, enum: ['none', 'softbinding', 'spiral', 'stapling', 'lamination'], default: 'none' },
  priority: { type: String, enum: ['normal', 'urgent'], default: 'normal' },
  pageRanges: [pageRangeSchema]
}, { _id: false });

const costBreakdownSchema = new mongoose.Schema({
  colorPages: { type: Number, default: 0 },
  bwPages: { type: Number, default: 0 },
  colorPagesCost: { type: Number, default: 0 },
  bwPagesCost: { type: Number, default: 0 },
  doubleSideCost: { type: Number, default: 0 },
  bindingCost: { type: Number, default: 0 },
  urgentSurcharge: { type: Number, default: 0 },
  coverSheetCost: { type: Number, default: 2 },
  total: { type: Number, required: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  token: {
    type: String,
    unique: true,
    default: () => 'PX' + Math.floor(100 + Math.random() * 900)
  },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName: { type: String, required: true },
  studentUSN: { type: String },
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  pdfUrl: { type: String },
  fileType: { type: String },
  printSettings: { type: printSettingsSchema, required: true },
  cost: { type: costBreakdownSchema, required: true },
  paymentMethod: { type: String, enum: ['upi', 'phonePe', 'googlePay', 'razorpay', 'paytm', 'counter'], default: 'counter' },
  paymentStatus: { type: String, enum: ['paid', 'unpaid', 'pending'], default: 'unpaid' },
  status: {
    type: String,
    enum: ['waiting', 'processing', 'printing', 'ready', 'completed', 'cancelled'],
    default: 'waiting'
  },
  queuePosition: { type: Number },
  estimatedTime: { type: Number, default: 10 },
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String
  }],
  smartHeader: { type: String },
  fileDeletedAt: { type: Date },
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

orderSchema.pre('save', function (next) {
  if (this.isNew) {
    this.statusHistory.push({ status: 'waiting', note: 'Order placed' });
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
