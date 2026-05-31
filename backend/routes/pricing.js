const express = require('express');
const Pricing = require('../models/Pricing');
const { protect, ownerOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/pricing - anyone can read prices (students need it for cost calc)
router.get('/', async (req, res) => {
  try {
    let pricing = await Pricing.findOne();
    if (!pricing) {
      pricing = await Pricing.create({});
    }
    res.json(pricing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/pricing - only owner can update prices
router.put('/', protect, ownerOnly, async (req, res) => {
  try {
    const { bw, color, doubleSide, softbinding, spiral, stapling, lamination, urgent } = req.body;
    let pricing = await Pricing.findOne();
    if (!pricing) pricing = new Pricing();

    if (bw !== undefined) pricing.bw = bw;
    if (color !== undefined) pricing.color = color;
    if (doubleSide !== undefined) pricing.doubleSide = doubleSide;
    if (softbinding !== undefined) pricing.softbinding = softbinding;
    if (spiral !== undefined) pricing.spiral = spiral;
    if (stapling !== undefined) pricing.stapling = stapling;
    if (lamination !== undefined) pricing.lamination = lamination;
    if (urgent !== undefined) pricing.urgent = urgent;
    pricing.updatedAt = new Date();

    await pricing.save();
    res.json(pricing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
