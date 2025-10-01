// Cron Job for Match Reminders
// This script runs periodically to check for upcoming matches and send reminders

const cron = require('node-cron');
const { processMatchReminders } = require('./matchReminderSender');

console.log('🕒 Starting Match Reminder Cron Job Service...');

// Run every 5 minutes
// Cron pattern: '*/5 * * * *' = every 5 minutes
const CRON_SCHEDULE = '*/5 * * * *';

// Start the cron job
const cronJob = cron.schedule(CRON_SCHEDULE, async () => {
  const timestamp = new Date().toISOString();
  console.log(`\n⏰ [${timestamp}] Running scheduled match reminder check...`);
  
  try {
    await processMatchReminders();
    console.log(`✅ [${timestamp}] Scheduled check completed successfully`);
  } catch (error) {
    console.error(`❌ [${timestamp}] Scheduled check failed:`, error);
  }
}, {
  scheduled: false, // Don't start immediately
  timezone: "UTC" // Use UTC timezone
});

// Start the cron job
cronJob.start();
console.log(`✅ Cron job started - running every 5 minutes (${CRON_SCHEDULE})`);
console.log('📅 Checking for matches that need 2-hour reminders...');

// Run once immediately on startup
processMatchReminders().then(() => {
  console.log('✅ Initial check completed');
}).catch(error => {
  console.error('❌ Initial check failed:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down cron job...');
  cronJob.stop();
  console.log('✅ Cron job stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down cron job...');
  cronJob.stop();
  console.log('✅ Cron job stopped');
  process.exit(0);
});

// Keep the process alive
console.log('🔄 Cron job is running... Press Ctrl+C to stop');

// Optional: Add a health check endpoint if running in a server environment
if (process.env.NODE_ENV === 'production') {
  const express = require('express');
  const app = express();
  const PORT = process.env.CRON_PORT || 3001;
  
  app.get('/health', (req, res) => {
    res.json({
      status: 'running',
      service: 'match-reminder-cron',
      schedule: CRON_SCHEDULE,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });
  
  app.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
  });
}

