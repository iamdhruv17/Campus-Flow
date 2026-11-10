const express = require('express');
const router = express.Router();
const { getFile } = require('../controllers/file.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/:id', protect, getFile);

module.exports = router;
