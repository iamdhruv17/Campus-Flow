require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { configureCloudinary } = require('./config/cloudinary');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Validate Cloudinary credentials at startup — fail fast if misconfigured
  // (only called when real credentials are provided; logs a warning otherwise)
  const { isCloudinaryConfigured, configureCloudinary } = require('./config/cloudinary');
  if (isCloudinaryConfigured()) {
    configureCloudinary();
  } else {
    console.warn('[Cloudinary] WARNING: Credentials not configured. File uploads will be unavailable.');
    console.warn('[Cloudinary] Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in server/.env');
  }
  await connectDB();
  app.listen(PORT, () => {
    console.log(`CampusFlow server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
