#!/usr/bin/env node
// send-notification-to-all.js
// Script to send push notifications to all users via Railway server

const https = require('https');
const http = require('http');

// Configuration
const SERVER_URL = 'https://hagz-push-server-production.up.railway.app'; // Replace with your actual Railway URL
const API_ENDPOINT = '/send-broadcast-notification';

/**
 * Send notification to all users
 */
async function sendNotificationToAll(title, message, data = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      title: title,
      message: message,
      data: data,
      sound: true
    });

    const url = new URL(SERVER_URL + API_ENDPOINT);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Test server health
 */
async function testServerHealth() {
  return new Promise((resolve, reject) => {
    const url = new URL(SERVER_URL + '/health');
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET'
    };

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse health response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Test specific token
 */
async function testSpecificToken(token, message = 'Test notification from script') {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      token: token,
      message: message
    });

    const url = new URL(SERVER_URL + '/test-token');
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse token test response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'health':
        console.log('🔍 Testing server health...');
        const health = await testServerHealth();
        console.log('✅ Server health:', health);
        break;

      case 'test-token':
        const token = args[1];
        if (!token) {
          console.error('❌ Token required for test-token command');
          console.log('Usage: node send-notification-to-all.js test-token <token>');
          process.exit(1);
        }
        console.log('🧪 Testing specific token...');
        const tokenResult = await testSpecificToken(token, args[2] || 'Test from script');
        console.log('✅ Token test result:', tokenResult);
        break;

      case 'broadcast':
        const title = args[1];
        const message = args[2];
        if (!title || !message) {
          console.error('❌ Title and message required for broadcast command');
          console.log('Usage: node send-notification-to-all.js broadcast "Title" "Message"');
          process.exit(1);
        }
        console.log('📢 Sending broadcast notification...');
        console.log(`Title: ${title}`);
        console.log(`Message: ${message}`);
        
        const result = await sendNotificationToAll(title, message, {
          timestamp: new Date().toISOString(),
          sentFrom: 'script'
        });
        
        console.log('✅ Broadcast result:', result);
        break;

      default:
        console.log(`
📱 HAGZ Push Notification Script

Usage:
  node send-notification-to-all.js health
  node send-notification-to-all.js test-token <token> [message]
  node send-notification-to-all.js broadcast "Title" "Message"

Examples:
  node send-notification-to-all.js health
  node send-notification-to-all.js test-token "ExponentPushToken[c-mLLnDKvCgMvBcqq5NYwL]"
  node send-notification-to-all.js broadcast "HAGZ Update" "New features available!"
        `);
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  sendNotificationToAll,
  testServerHealth,
  testSpecificToken
};
