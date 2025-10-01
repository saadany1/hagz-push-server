// server/pushNotificationSender.js
// This is a Node.js script to send push notifications using Expo Push Service
// Install: npm install expo-server-sdk-node

const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Send push notifications to multiple users
 * @param {string[]} tokens - Array of Expo push tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data to send with notification
 * @returns {Promise<object>} - Result with success/failure counts
 */
async function sendPushNotifications(tokens, title, body, data = {}) {
  console.log(`📤 Sending push notifications to ${tokens.length} devices...`);

  // Create the messages that you want to send to clients
  const messages = [];
  
  for (const pushToken of tokens) {
    // Check that all your push tokens appear to be valid Expo push tokens
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`❌ Push token ${pushToken} is not a valid Expo push token`);
      continue;
    }

    // Construct a message
    messages.push({
      to: pushToken,
      sound: 'notification_sound.wav',
      title: title,
      body: body,
      data: data,
      priority: 'high',
    });
  }

  // The Expo push notification service accepts batches of notifications
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  
  // Send the chunks to the Expo push notification service
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log('📨 Sent chunk:', ticketChunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('❌ Error sending chunk:', error);
    }
  }

  // Count results
  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];

  tickets.forEach((ticket, index) => {
    if (ticket.status === 'ok') {
      successCount++;
    } else {
      failureCount++;
      console.error(`❌ Failed to send notification to ${tokens[index]}:`, ticket);
      
      // Collect invalid tokens for cleanup
      if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
        invalidTokens.push(tokens[index]);
      }
    }
  });

  console.log(`✅ Results: ${successCount} success, ${failureCount} failed`);
  
  return {
    success: successCount,
    failed: failureCount,
    total: tokens.length,
    invalidTokens,
    tickets
  };
}

/**
 * Test function to send a notification to a single token
 * Usage: node pushNotificationSender.js test "ExponentPushToken[YOUR_TOKEN_HERE]"
 */
async function testSingleNotification(token) {
  console.log('🧪 Testing single notification...');
  
  const result = await sendPushNotifications(
    [token],
    '🧪 Test Notification',
    'This is a test notification from the server!',
    { 
      screen: 'More',
      test: true,
      timestamp: new Date().toISOString()
    }
  );
  
  console.log('🧪 Test result:', result);
  return result;
}

/**
 * Send broadcast notification to all users (admin function)
 * This would typically be called from your API endpoint
 */
async function sendBroadcastNotification(title, message, userTokens, data = {}) {
  console.log('📢 Sending broadcast notification...');
  
  const result = await sendPushNotifications(
    userTokens,
    title,
    message,
    {
      ...data,
      type: 'broadcast',
      screen: 'More'
    }
  );
  
  return result;
}

// Command line interface for testing
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
📱 Push Notification Sender

Usage:
  node pushNotificationSender.js test <expo-push-token>
  node pushNotificationSender.js broadcast <title> <message> <token1,token2,...>

Examples:
  node pushNotificationSender.js test "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
  node pushNotificationSender.js broadcast "Hello" "Test message" "ExponentPushToken[xxx],ExponentPushToken[yyy]"
    `);
    process.exit(1);
  }
  
  const command = args[0];
  
  if (command === 'test' && args[1]) {
    testSingleNotification(args[1])
      .then(() => process.exit(0))
      .catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
      });
  } else if (command === 'broadcast' && args[1] && args[2] && args[3]) {
    const title = args[1];
    const message = args[2];
    const tokens = args[3].split(',');
    
    sendBroadcastNotification(title, message, tokens)
      .then((result) => {
        console.log('📢 Broadcast result:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Broadcast failed:', error);
        process.exit(1);
      });
  } else {
    console.error('❌ Invalid arguments');
    process.exit(1);
  }
}

module.exports = {
  sendPushNotifications,
  testSingleNotification,
  sendBroadcastNotification
};
