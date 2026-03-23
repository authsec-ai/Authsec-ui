const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to log all incoming requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} - Request received`);
  next();
});

// Dynamic config endpoint
app.get('/config.js', (req, res) => {
  const config = {
    VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:7468/authsec',
    VITE_OAUTH_BASE_URL: process.env.VITE_OAUTH_BASE_URL || 'http://localhost:4444',
    VITE_HUBSPOT_ACCESS_TOKEN: process.env.VITE_HUBSPOT_ACCESS_TOKEN || ''
  };

  const configScript = `window.ENV = ${JSON.stringify(config)};`;

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(configScript);

  console.log(`[${new Date().toISOString()}] Config served:`, config);
});

// Serve static files from the React app's dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: {
      VITE_API_URL: process.env.VITE_API_URL || 'not set',
      VITE_OAUTH_BASE_URL: process.env.VITE_OAUTH_BASE_URL || 'not set',
      VITE_HUBSPOT_ACCESS_TOKEN: process.env.VITE_HUBSPOT_ACCESS_TOKEN ? '***configured***' : 'not set'
    }
  };
  console.log(`[${healthStatus.timestamp}] Health check - VITE_API_URL: ${healthStatus.environment.VITE_API_URL}, VITE_OAUTH_BASE_URL: ${healthStatus.environment.VITE_OAUTH_BASE_URL}, HubSpot: ${healthStatus.environment.VITE_HUBSPOT_ACCESS_TOKEN}`);
  res.status(200).json(healthStatus);
});

// Catch-all route to serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${port}`);
  console.log(`[${new Date().toISOString()}] VITE_API_URL: ${process.env.VITE_API_URL || 'not set'}`);
  console.log(`[${new Date().toISOString()}] VITE_OAUTH_BASE_URL: ${process.env.VITE_OAUTH_BASE_URL || 'not set'}`);
});
