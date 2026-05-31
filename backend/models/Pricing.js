const mongoose = require('mongoose');

const pricingSchema = new mongoose.Schema({
  bw: { type: Number, default: 2 },
  color: { type: Number, default: 10 },
  doubleSide: { type: Number, default: 1.5 },
  softbinding: { type: Number, default: 15 },
  spiral: { type: Number, default: 30 },
  stapling: { type: Number, default: 5 },
  lamination: { type: Number, default: 20 },
  urgent: { type: Number, default: 20 },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pricing', pricingSchema);
