import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.WEBHOOK_PORT || 3001;
const LOG_FILE = process.env.LOG_FILE || './recording_events.log';
const WEBHOOK_SECRET = process.env.DAILY_WEBHOOK_SECRET;

// Middleware to parse JSON and raw body for signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Ensure log file exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Function to write logs with timestamp
function writeLog(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    console.log(logEntry.trim());
    
    try {
        fs.appendFileSync(LOG_FILE, logEntry);
    } catch (error) {
        console.error('Error writing to log file:', error);
    }
}

// Function to verify webhook signature
function verifyWebhookSignature(payload, signature, secret) {
    if (!secret || !signature) {
        return false;
    }
    
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    
    // Daily.co sends signature in format "sha256=<hash>"
    const actualSignature = signature.startsWith('sha256=') 
        ? signature.slice(7) 
        : signature;
    
    return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(actualSignature, 'hex')
    );
}

// Function to get recording download URL
async function getRecordingDownloadUrl(recordingId) {
    try {
        const response = await axios.get(`https://api.daily.co/v1/recordings/${recordingId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data.download_link || null;
    } catch (error) {
        console.error('Error fetching recording details:', error.response?.data || error.message);
        return null;
    }
}

// Function to get recording access link
async function getRecordingAccessLink(recordingId, validForSecs = 3600) {
    try {
        const response = await axios.get(`https://api.daily.co/v1/recordings/${recordingId}/access-link?valid_for_secs=${validForSecs}`, {
            headers: {
                'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data.download_link || null;
    } catch (error) {
        console.error('Error fetching recording access link:', error.response?.data || error.message);
        return null;
    }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-daily-signature'] || req.headers['x-signature'];
        const payload = req.body;
        
        // Debug logging
        console.log('Webhook received with headers:', req.headers);
        console.log('Webhook payload type:', typeof payload);
        console.log('Webhook payload:', payload);
        
        // Verify webhook signature if secret is provided
        if (WEBHOOK_SECRET && signature) {
            const isValid = verifyWebhookSignature(payload, signature, WEBHOOK_SECRET);
            if (!isValid) {
                writeLog('❌ WEBHOOK ERROR: Invalid signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }
        
        // Parse the JSON payload only if it's a string
        let event;
        if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
            event = JSON.parse(payload.toString());
        } else {
            // If payload is already an object, use it directly
            event = payload;
        }
        
        // Log the parsed event
        console.log('Parsed event:', JSON.stringify(event, null, 2));
        
        // Handle different recording events
        switch (event.type) {
            case 'recording.started':
                handleRecordingStarted(event);
                break;
                
            case 'recording.ready-to-download':
                await handleRecordingReady(event);
                break;
                
            case 'recording.error':
                handleRecordingError(event);
                break;
                
            default:
                writeLog(`📝 WEBHOOK: Received event type: ${event.type}`);
        }
        
        // Always respond with 200 to acknowledge receipt
        res.status(200).json({ status: 'received' });
        
    } catch (error) {
        console.error('Webhook error:', error);
        writeLog(`❌ WEBHOOK ERROR: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Handle recording started event
function handleRecordingStarted(event) {
    if (!event || !event.payload) {
        writeLog(`❌ INVALID EVENT: Missing payload in recording.started event`);
        console.log('Invalid event structure:', JSON.stringify(event, null, 2));
        return;
    }
    
    const { room_name, recording_id, started_by, start_ts } = event.payload;
    const startTime = new Date(start_ts * 1000).toLocaleString();
    
    const message = `🎬 RECORDING STARTED
    Room: ${room_name}
    Recording ID: ${recording_id}
    Started by: ${started_by || 'Unknown'}
    Start time: ${startTime}`;
    
    writeLog(message);
}

// Handle recording ready event
async function handleRecordingReady(event) {
    if (!event || !event.payload) {
        writeLog(`❌ INVALID EVENT: Missing payload in recording.ready-to-download event`);
        console.log('Invalid event structure:', JSON.stringify(event, null, 2));
        return;
    }
    
    const { room_name, recording_id, duration, start_ts, s3_key } = event.payload;
    const startTime = new Date(start_ts * 1000).toLocaleString();
    const durationMinutes = Math.round(duration / 60 * 100) / 100;
    
    // Try to get download URL
    const downloadUrl = await getRecordingDownloadUrl(recording_id);
    
    // Try to get access link (streaming URL)
    const accessLink = await getRecordingAccessLink(recording_id);
    
    // Generate share URL based on s3_key
    const shareUrl = 'Not available'; // Daily.co no longer provides share_token in the webhook payload
    
    const message = `✅ RECORDING STOPPED & READY
    Room: ${room_name}
    Recording ID: ${recording_id}
    Duration: ${durationMinutes} minutes
    Started: ${startTime}
    S3 Key: ${s3_key || 'Not available'}
    
    📥 Download URL: ${downloadUrl || 'Not available'}
    🎦 Streaming URL: ${accessLink || 'Not available'}`;
    
    writeLog(message);
}

// Handle recording error event
function handleRecordingError(event) {
    if (!event || !event.payload) {
        writeLog(`❌ INVALID EVENT: Missing payload in recording.error event`);
        console.log('Invalid event structure:', JSON.stringify(event, null, 2));
        return;
    }
    
    const { room_name, recording_id, error_msg } = event.payload;
    
    const message = `❌ RECORDING ERROR
    Room: ${room_name}
    Recording ID: ${recording_id}
    Error: ${error_msg || 'Unknown error'}`;
    
    writeLog(message);
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        logFile: LOG_FILE 
    });
});

// Test endpoint to verify webhook is working
app.get('/test', (req, res) => {
    writeLog('🧪 TEST: Webhook server test endpoint accessed');
    res.json({ 
        message: 'Webhook server is running',
        logFile: LOG_FILE,
        timestamp: new Date().toISOString()
    });
});

// Handle Daily.co webhook verification and events at root path
app.all('/', async (req, res) => {
    try {
        // Handle GET requests (verification)
        if (req.method === 'GET') {
            writeLog('🔍 VERIFICATION: Daily.co webhook verification request received');
            return res.status(200).json({ 
                message: 'Daily.co webhook endpoint verified',
                timestamp: new Date().toISOString()
            });
        }
        
        // Handle POST requests (actual webhook events)
        if (req.method === 'POST') {
            const signature = req.headers['x-daily-signature'] || req.headers['x-signature'];
            const payload = req.body;
            
            // Debug logging
            console.log('Root endpoint received webhook with headers:', req.headers);
            console.log('Root endpoint payload type:', typeof payload);
            console.log('Root endpoint payload:', payload);
            
            // Verify webhook signature if secret is provided
            if (WEBHOOK_SECRET && signature) {
                const isValid = verifyWebhookSignature(payload, signature, WEBHOOK_SECRET);
                if (!isValid) {
                    writeLog('❌ WEBHOOK ERROR: Invalid signature');
                    return res.status(401).json({ error: 'Invalid signature' });
                }
            }
            
            // Parse the JSON payload only if it's a string
            let event;
            if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
                event = JSON.parse(payload.toString());
            } else {
                // If payload is already an object, use it directly
                event = payload;
            }
            
            // Log the parsed event
            console.log('Root endpoint parsed event:', JSON.stringify(event, null, 2));
            
            writeLog(`📝 WEBHOOK EVENT RECEIVED: ${event.type}`);
            
            // Handle different recording events
            switch (event.type) {
                case 'recording.started':
                    handleRecordingStarted(event);
                    break;
                    
                case 'recording.ready-to-download':
                    await handleRecordingReady(event);
                    break;
                    
                case 'recording.error':
                    handleRecordingError(event);
                    break;
                    
                default:
                    writeLog(`📝 WEBHOOK: Received event type: ${event.type}`);
            }
            
            // Always respond with 200 to acknowledge receipt
            return res.status(200).json({ status: 'received' });
        }
        
        // Handle other methods
        res.status(405).json({ error: 'Method not allowed' });
        
    } catch (error) {
        console.error('Webhook error:', error);
        writeLog(`❌ WEBHOOK ERROR: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Also handle GET requests to /webhook for verification
app.get('/webhook', (req, res) => {
    writeLog('🔍 VERIFICATION: Daily.co webhook GET verification request');
    res.status(200).json({ 
        message: 'Daily.co webhook endpoint verified',
        timestamp: new Date().toISOString()
    });
});

// Start the server
app.listen(PORT, () => {
    const message = `🚀 Daily.co Webhook Server started on port ${PORT}
    Webhook URL: http://localhost:${PORT}/webhook
    Health check: http://localhost:${PORT}/health
    Test endpoint: http://localhost:${PORT}/test
    Log file: ${LOG_FILE}`;
    
    writeLog(message);
});

// Graceful shutdown
process.on('SIGINT', () => {
    writeLog('🛑 Webhook server shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    writeLog('🛑 Webhook server terminated');
    process.exit(0);
});

export default app;