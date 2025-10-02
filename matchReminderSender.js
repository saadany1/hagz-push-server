// Match Reminder Server-Side Notification Sender
// This handles sending push notifications for match reminders using Expo Push Service

const { Expo } = require('expo-server-sdk');
const { createClient } = require('@supabase/supabase-js');

// Initialize Expo SDK
const expo = new Expo();

// Initialize Supabase (you'll need to set these environment variables)
const supabaseUrl = process.env.SUPABASE_URL || 'your-supabase-url';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Main function to check and send match reminders
 */
async function processMatchReminders() {
  console.log('🚀 Starting match reminder process...');
  
  try {
    // Get matches that need reminders
    const { data: matches, error: matchesError } = await supabase
      .rpc('get_matches_needing_reminders');

    if (matchesError) {
      console.error('❌ Error fetching matches:', matchesError);
      return;
    }

    if (!matches || matches.length === 0) {
      console.log('📅 No matches need reminders at this time');
      return;
    }

    console.log(`📅 Found ${matches.length} matches needing reminders`);

    // Process each match
    for (const match of matches) {
      await processMatchReminder(match);
    }

    console.log('✅ Match reminder process completed');

  } catch (error) {
    console.error('❌ Error in processMatchReminders:', error);
  }
}

/**
 * Process reminder for a single match
 */
async function processMatchReminder(match) {
  console.log(`📅 Processing match ${match.booking_id} at ${match.pitch_name}`);

  try {
    // Get all participants for this match
    const { data: participants, error: participantsError } = await supabase
      .rpc('get_match_participants', { booking_uuid: match.booking_id });

    if (participantsError) {
      console.error('❌ Error fetching participants:', participantsError);
      return;
    }

    if (!participants || participants.length === 0) {
      console.log(`📅 No participants with push tokens found for match ${match.booking_id}`);
      await markReminderSent(match.booking_id);
      return;
    }

    // Filter valid Expo push tokens
    const validParticipants = participants.filter(p => 
      p.push_token && Expo.isExpoPushToken(p.push_token)
    );

    if (validParticipants.length === 0) {
      console.log(`📅 No valid push tokens found for match ${match.booking_id}`);
      await markReminderSent(match.booking_id);
      return;
    }

    // Create notification content
    const matchTime = formatMatchTime(match.match_date, match.match_time);
    const matchTypeText = match.match_type === 'ranked' ? 'Ranked Match' : 'Friendly Match';
    
    const title = `⚽ ${matchTypeText} Reminder`;
    const message = `Your match at ${match.pitch_name} starts in 2 hours (${matchTime}). Get ready!`;

    // Prepare notification messages
    const messages = validParticipants.map(participant => ({
      to: participant.push_token,
      sound: 'notification_sound.wav',
      title: title,
      body: message,
      data: {
        screen: 'GameDetails',
        gameId: match.booking_id,
        matchType: match.match_type,
        pitchName: match.pitch_name,
        matchTime: matchTime,
        notificationType: 'match_reminder'
      },
      priority: 'high',
      badge: 1,
      channelId: 'NL' // Use HAGZ notification channel
    }));

    console.log(`📱 Sending ${messages.length} notifications for match ${match.booking_id}`);

    // Send notifications in chunks
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        console.log(`✅ Sent chunk of ${chunk.length} notifications`);
      } catch (error) {
        console.error('❌ Error sending notification chunk:', error);
      }
    }

    // Log notifications in database
    await logNotifications(validParticipants, match.booking_id, title, message);

    // Mark reminder as sent
    await markReminderSent(match.booking_id);

    // Process tickets for any errors
    await processTickets(tickets, validParticipants);

    console.log(`✅ Match reminder completed for ${match.booking_id}`);

  } catch (error) {
    console.error(`❌ Error processing match reminder for ${match.booking_id}:`, error);
  }
}

/**
 * Log notifications in the database
 */
async function logNotifications(participants, bookingId, title, message) {
  try {
    const notificationRecords = participants.map(participant => ({
      user_id: participant.user_id,
      type: 'match_reminder',
      title: title,
      message: message,
      data: {
        booking_id: bookingId,
        reminder_type: '2_hour_reminder',
        sent_at: new Date().toISOString()
      },
      status: 'sent'
    }));

    const { error } = await supabase
      .from('notifications')
      .insert(notificationRecords);

    if (error) {
      console.error('❌ Error logging notifications:', error);
    } else {
      console.log(`✅ Logged ${notificationRecords.length} notifications in database`);
    }
  } catch (error) {
    console.error('❌ Error in logNotifications:', error);
  }
}

/**
 * Mark a match reminder as sent
 */
async function markReminderSent(bookingId) {
  try {
    const { error } = await supabase
      .rpc('mark_reminder_sent', { booking_uuid: bookingId });

    if (error) {
      console.error('❌ Error marking reminder as sent:', error);
    } else {
      console.log(`✅ Marked reminder as sent for booking ${bookingId}`);
    }
  } catch (error) {
    console.error('❌ Error in markReminderSent:', error);
  }
}

/**
 * Process notification tickets for errors and cleanup
 */
async function processTickets(tickets, participants) {
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    const participant = participants[i];

    if (ticket.status === 'error') {
      console.error(`❌ Notification error for ${participant.email}:`, ticket.message);
      
      if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
        // Token is invalid, should remove it from database
        console.log(`🧹 Removing invalid token for user ${participant.user_id}`);
        await removeInvalidToken(participant.user_id);
      }
    } else {
      console.log(`✅ Notification sent successfully to ${participant.email}`);
    }
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
    }
  } catch (error) {
    console.error('❌ Error in removeInvalidToken:', error);
  }
}

/**
 * Format match date and time for display
 */
function formatMatchTime(date, time) {
  try {
    const matchDate = new Date(`${date}T${time}`);
    return matchDate.toLocaleString('en-US', {
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
 * Manual trigger function for testing
 */
async function triggerMatchReminders() {
  console.log('🔧 Manually triggering match reminders...');
  await processMatchReminders();
}

// Export functions
module.exports = {
  processMatchReminders,
  triggerMatchReminders
};

// If running directly, start the process
if (require.main === module) {
  console.log('🚀 Match Reminder Service Started');
  processMatchReminders().then(() => {
    console.log('✅ Process completed');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Process failed:', error);
    process.exit(1);
  });
}

