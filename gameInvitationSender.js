// Game Invitation Server-Side Notification Sender
// This handles sending push notifications for game invitations using Expo Push Service

const { Expo } = require('expo-server-sdk');
const { createClient } = require('@supabase/supabase-js');

// Initialize Expo SDK
const expo = new Expo();

// Initialize Supabase (you'll need to set these environment variables)
const supabaseUrl = process.env.SUPABASE_URL || 'https://wlzuzohbuonvfnembyyl.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Send game invitation push notification
 */
async function sendGameInvitationNotification(invitationData) {
  console.log('🎮 Sending game invitation notification...');
  
  try {
    const {
      targetUserId,
      inviterUserId,
      gameId,
      gameTitle,
      gameDate,
      gameTime,
      pitchName,
      pitchLocation
    } = invitationData;

    // Get target user's push token
    const { data: targetUser, error: userError } = await supabase
      .from('user_profiles')
      .select('id, push_token, full_name, email')
      .eq('id', targetUserId)
      .single();

    if (userError || !targetUser) {
      console.error('❌ Target user not found:', userError);
      return { success: false, error: 'User not found' };
    }

    if (!targetUser.push_token) {
      console.log(`📱 No push token for user ${targetUserId}`);
      return { success: false, error: 'No push token' };
    }

    if (!Expo.isExpoPushToken(targetUser.push_token)) {
      console.error('❌ Invalid push token:', targetUser.push_token);
      return { success: false, error: 'Invalid push token' };
    }

    // Get inviter details
    const { data: inviterUser, error: inviterError } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', inviterUserId)
      .single();

    if (inviterError || !inviterUser) {
      console.error('❌ Inviter user not found:', inviterError);
      return { success: false, error: 'Inviter not found' };
    }

    const inviterName = inviterUser.full_name || inviterUser.email || 'Someone';
    
    // Create notification content
    const title = '⚽ Game Invitation';
    const message = `${inviterName} invited you to join a match at ${pitchName} on ${formatDateTime(gameDate, gameTime)}`;

    // Prepare notification message
    const notificationMessage = {
      to: targetUser.push_token,
      sound: 'notification_sound.wav',
      title: title,
      body: message,
      data: {
        screen: 'GameDetails',
        gameId: gameId,
        type: 'game_invitation',
        pitchName: pitchName,
        gameDate: gameDate,
        gameTime: gameTime,
        inviterName: inviterName,
        notificationType: 'game_invitation'
      },
      priority: 'high',
      badge: 1,
      channelId: 'NL' // Use HAGZ notification channel
    };

    console.log(`📱 Sending invitation notification to ${targetUser.email}`);

    // Send notification
    const tickets = await expo.sendPushNotificationsAsync([notificationMessage]);
    const ticket = tickets[0];

    // Log notification in database
    await logInvitationNotification(targetUserId, gameId, title, message, inviterUserId);

    // Process ticket for errors
    if (ticket.status === 'error') {
      console.error(`❌ Notification error for ${targetUser.email}:`, ticket.message);
      
      if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
        // Token is invalid, remove it from database
        console.log(`🧹 Removing invalid token for user ${targetUserId}`);
        await removeInvalidToken(targetUserId);
      }
      
      return { success: false, error: ticket.message };
    } else {
      console.log(`✅ Invitation notification sent successfully to ${targetUser.email}`);
      return { success: true };
    }

  } catch (error) {
    console.error('❌ Error in sendGameInvitationNotification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send bulk game invitations
 */
async function sendBulkGameInvitations(bulkInvitationData) {
  console.log('🎮 Sending bulk game invitations...');
  
  try {
    const {
      targetUserIds,
      inviterUserId,
      gameId,
      gameTitle,
      gameDate,
      gameTime,
      pitchName,
      pitchLocation
    } = bulkInvitationData;

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Send invitations to each user
    for (const userId of targetUserIds) {
      try {
        const result = await sendGameInvitationNotification({
          targetUserId: userId,
          inviterUserId,
          gameId,
          gameTitle,
          gameDate,
          gameTime,
          pitchName,
          pitchLocation
        });

        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(`User ${userId}: ${result.error}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`User ${userId}: ${error.message}`);
      }
    }

    console.log(`📊 Bulk invitations result: ${results.success} success, ${results.failed} failed`);
    return results;

  } catch (error) {
    console.error('❌ Error in sendBulkGameInvitations:', error);
    return { success: 0, failed: 1, errors: [error.message] };
  }
}

/**
 * Log invitation notification in database
 */
async function logInvitationNotification(userId, gameId, title, message, inviterId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'game_invitation',
        title: title,
        message: message,
        data: {
          game_id: gameId,
          invited_by: inviterId,
          sent_at: new Date().toISOString(),
          notification_type: 'push'
        },
        status: 'sent'
      });

    if (error) {
      console.error('❌ Error logging invitation notification:', error);
    } else {
      console.log(`✅ Logged invitation notification for user ${userId}`);
    }
  } catch (error) {
    console.error('❌ Error in logInvitationNotification:', error);
  }
}

/**
 * Remove invalid push token from database
 */
async function removeInvalidToken(userId) {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({ push_token: null })
      .eq('id', userId);

    if (error) {
      console.error('❌ Error removing invalid token:', error);
    } else {
      console.log(`✅ Removed invalid token for user ${userId}`);
    }
  } catch (error) {
    console.error('❌ Error in removeInvalidToken:', error);
  }
}

/**
 * Format date and time for display
 */
function formatDateTime(date, time) {
  try {
    const dateTime = new Date(`${date}T${time}`);
    return dateTime.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    return `${date} at ${time}`;
  }
}

/**
 * Test function to send a sample invitation
 */
async function testGameInvitation() {
  console.log('🧪 Testing game invitation notification...');
  
  const testData = {
    targetUserId: 'test-user-id',
    inviterUserId: 'test-inviter-id',
    gameId: 'test-game-id',
    gameTitle: 'Test Football Match',
    gameDate: '2024-01-01',
    gameTime: '18:00',
    pitchName: 'Test Pitch',
    pitchLocation: 'Test Location'
  };

  const result = await sendGameInvitationNotification(testData);
  console.log('🧪 Test result:', result);
  return result;
}

// Export functions
module.exports = {
  sendGameInvitationNotification,
  sendBulkGameInvitations,
  testGameInvitation
};

// If running directly, run test
if (require.main === module) {
  console.log('🚀 Game Invitation Notification Service Started');
  testGameInvitation().then(() => {
    console.log('✅ Test completed');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

