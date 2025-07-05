import dotenv from 'dotenv';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Check if .env file exists, if not create from example
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
    console.log('No .env file found. Creating one...');
    fs.writeFileSync(envPath, `# Daily.co API credentials
DAILY_API_KEY=your_daily_api_key_here
DAILY_DOMAIN=your-domain.daily.co
DAILY_WEBHOOK_SECRET=your_webhook_secret_here

# Optional: AWS credentials for recordings
RECORDING_BUCKET_NAME=your_s3_bucket_name
RECORDING_BUCKET_REGION=us-east-1
RECORDING_ASSUME_ROLE_ARN=your_role_arn
RECORDING_ALLOW_API_ACCESS=true`);
    console.log('Created .env file. Please edit it with your API credentials.');
    process.exit(1);
}

// Validate required environment variables
if (!process.env.DAILY_API_KEY) {
    console.error('Error: DAILY_API_KEY is not set in .env file');
    process.exit(1);
}

// Create axios instance for Daily.co API
const dailyApi = axios.create({
    baseURL: 'https://api.daily.co/v1/',
    headers: {
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

// Daily.co API test functions
class DailyTester {
    constructor() {
        this.domainId = null;
        this.roomName = null;
        this.recordingId = null;
    }

    async getDomainConfig() {
        try {
            console.log('Getting domain configuration...');
            const response = await dailyApi.get('/');
            this.domainId = response.data.domain_id;
            console.log('Domain config:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error getting domain config:', error.response?.data || error.message);
            throw new Error('Failed to get domain configuration');
        }
    }

    async createRoom() {
        try {
            this.roomName = `test-room-${uuidv4().substring(0, 8)}`;
            console.log(`Creating room: ${this.roomName}`);
            
            const response = await dailyApi.post('/rooms', {
                name: this.roomName,
                privacy: 'private',
                properties: {
                    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // Expires in 24 hours
                    enable_chat: true,
                    enable_screenshare: true,
                    start_video_off: false,
                    start_audio_off: false,
                    enable_recording: 'cloud',
                }
            });
            
            console.log('Room created:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error creating room:', error.response?.data || error.message);
            throw new Error('Failed to create room');
        }
    }

    generateMeetingToken(isInterviewer = false) {
        if (!this.domainId || !this.roomName) {
            throw new Error('Domain ID and Room Name must be set before generating token');
        }
        
        const participantName = isInterviewer ? 'Test Interviewer' : 'Test Candidate';
        const now = Math.floor(Date.now() / 1000);
        
        const payload = {
            r: this.roomName,
            d: this.domainId,
            u: participantName,
            o: isInterviewer,
            iat: now,
            exp: now + (2 * 60 * 60),
            enable_recording_ui: false,
            
            ...(isInterviewer && {
                sr: true,
                er: 'cloud'
            }),
            
            p: {
                hasPresence: true,
                canSend: true,
                canReceive: {
                    base: true
                }
            }
        };

        const token = jwt.sign(payload, process.env.DAILY_API_KEY, {
            algorithm: 'HS256'
        });
        
        console.log(`Generated token for ${participantName}:`, token);
        return token;
    }

    async startRecording() {
        if (!this.roomName) {
            throw new Error('Room Name must be set before starting recording');
        }
        
        try {
            console.log(`Starting recording for room: ${this.roomName}`);
            const response = await dailyApi.post(`/rooms/${this.roomName}/recordings`, {
                properties: {
                    layout: 'default',
                    max_duration: 300, // 5 minutes for testing
                }
            });
            
            this.recordingId = response.data.id;
            console.log('Recording started:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error starting recording:', error.response?.data || error.message);
            throw new Error('Failed to start recording');
        }
    }

    async stopRecording() {
        if (!this.roomName) {
            throw new Error('Room Name must be set before stopping recording');
        }
        
        try {
            console.log(`Stopping recording for room: ${this.roomName}`);
            const response = await dailyApi.patch(`/rooms/${this.roomName}/recordings`, {
                properties: {
                    stop: true
                }
            });
            
            console.log('Recording stopped:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error stopping recording:', error.response?.data || error.message);
            throw new Error('Failed to stop recording');
        }
    }

    async listRecordings() {
        try {
            const url = this.roomName ? `/recordings?room_name=${this.roomName}` : '/recordings';
            console.log(`Listing recordings${this.roomName ? ` for room: ${this.roomName}` : ''}`);
            
            const response = await dailyApi.get(url);
            console.log('Recordings:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error listing recordings:', error.response?.data || error.message);
            throw new Error('Failed to list recordings');
        }
    }

    async getRecordingById(recordingId) {
        try {
            console.log(`Getting recording with ID: ${recordingId}`);
            const response = await dailyApi.get(`/recordings/${recordingId}`);
            console.log('Recording details:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error getting recording:', error.response?.data || error.message);
            throw new Error('Failed to get recording details');
        }
    }

    async listRecordingsByRoom(roomName) {
        try {
            console.log(`Listing recordings for room: ${roomName}`);
            const response = await dailyApi.get(`/recordings?room_name=${roomName}`);
            console.log('Recordings for room:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error listing recordings for room:', error.response?.data || error.message);
            throw new Error('Failed to list recordings for room');
        }
    }

    async getRecordingStatus() {
        if (!this.recordingId) {
            throw new Error('Recording ID must be set before checking status');
        }
        
        try {
            console.log(`Getting status for recording: ${this.recordingId}`);
            const response = await dailyApi.get(`/recordings/${this.recordingId}`);
            console.log('Recording status:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error getting recording status:', error.response?.data || error.message);
            throw new Error('Failed to get recording status');
        }
    }

    async getRecordingDownloadUrl(recordingId) {
        try {
            console.log(`Getting download URL for recording: ${recordingId}`);
            const response = await dailyApi.get(`/recordings/${recordingId}`);
            
            console.log('Recording details:', response.data);
            
            if (response.data.download_link) {
                console.log('Download URL:', response.data.download_link);
                return response.data.download_link;
            } else {
                console.log('Recording may still be processing or download link not available');
                return null;
            }
        } catch (error) {
            console.error('Error getting recording download URL:', error.response?.data || error.message);
            throw error;
        }
    }

    async getRecordingShareUrl(shareToken) {
        const domain = process.env.DAILY_DOMAIN || 'api.daily.co';
        const shareUrl = `https://${domain.replace('.daily.co', '')}.daily.co/rec/${shareToken}`;
        console.log('Recording share URL:', shareUrl);
        return shareUrl;
    }

    async getRecordingAccessLink(recordingId, validForSecs = 3600) {
        try {
            console.log(`Getting access link for recording: ${recordingId}`);
            const response = await dailyApi.get(`/recordings/${recordingId}/access-link?valid_for_secs=${validForSecs}`);
            
            if (response.data.download_link) {
                console.log('Recording access link:', response.data.download_link);
                console.log('Link expires at:', new Date(response.data.expires * 1000).toLocaleString());
                return response.data.download_link;
            } else {
                console.log('Access link not available');
                return null;
            }
        } catch (error) {
            console.error('Error getting recording access link:', error.response?.data || error.message);
            throw error;
        }
    }
    
    async getRoomRecordingsWithAccessLinks(roomName, validForSecs = 3600) {
        try {
            console.log(`Getting all recordings for room: ${roomName}`);
            const recordingsResponse = await dailyApi.get(`/recordings?room_name=${roomName}`);
            
            if (!recordingsResponse.data.data || recordingsResponse.data.data.length === 0) {
                console.log(`No recordings found for room: ${roomName}`);
                return [];
            }
            
            console.log(`Found ${recordingsResponse.data.data.length} recordings for room: ${roomName}`);
            
            const recordingsWithLinks = [];
            
            for (const recording of recordingsResponse.data.data) {
                console.log(`\nProcessing recording: ${recording.id}`);
                console.log(`  Status: ${recording.status}`);
                console.log(`  Duration: ${recording.duration} seconds`);
                console.log(`  Started at: ${new Date(recording.start_ts * 1000).toLocaleString()}`);
                
                try {
                    if (recording.status === 'finished') {
                        const accessLinkResponse = await dailyApi.get(`/recordings/${recording.id}/access-link?valid_for_secs=${validForSecs}`);
                        
                        if (accessLinkResponse.data.download_link) {
                            const accessLink = accessLinkResponse.data.download_link;
                            const expiresAt = new Date(accessLinkResponse.data.expires * 1000).toLocaleString();
                            
                            console.log(`  Access link: ${accessLink}`);
                            console.log(`  Link expires at: ${expiresAt}`);
                            
                            recordingsWithLinks.push({
                                recording,
                                accessLink: accessLink,
                                expiresAt: expiresAt
                            });
                        } else {
                            console.log(`  Access link not available for recording: ${recording.id}`);
                            recordingsWithLinks.push({
                                recording,
                                accessLink: null,
                                expiresAt: null
                            });
                        }
                    } else {
                        console.log(`  Recording ${recording.id} is not finished (status: ${recording.status}), skipping access link generation`);
                        recordingsWithLinks.push({
                            recording,
                            accessLink: null,
                            expiresAt: null
                        });
                    }
                } catch (error) {
                    console.error(`  Error getting access link for recording ${recording.id}:`, error.response?.data || error.message);
                    recordingsWithLinks.push({
                        recording,
                        accessLink: null,
                        expiresAt: null,
                        error: error.message
                    });
                }
            }
            
            console.log('\nSummary of recordings with access links:');
            recordingsWithLinks.forEach((item, index) => {
                console.log(`\nRecording ${index + 1}:`);
                console.log(`  ID: ${item.recording.id}`);
                console.log(`  Status: ${item.recording.status}`);
                console.log(`  Duration: ${item.recording.duration} seconds`);
                if (item.accessLink) {
                    console.log(`  Access link available, expires at: ${item.expiresAt}`);
                } else if (item.error) {
                    console.log(`  Error getting access link: ${item.error}`);
                } else if (item.recording.status !== 'finished') {
                    console.log(`  No access link: recording not finished`);
                } else {
                    console.log(`  No access link available`);
                }
            });
            
            return recordingsWithLinks;
        } catch (error) {
            console.error(`Error getting recordings for room ${roomName}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async downloadRecording(recordingId, outputPath = './recordings/') {
        try {
            const downloadUrl = await this.getRecordingDownloadUrl(recordingId);
            
            if (!downloadUrl) {
                throw new Error('Download URL not available');
            }
            
            // Create recordings directory if it doesn't exist
            if (!fs.existsSync(outputPath)) {
                fs.mkdirSync(outputPath, { recursive: true });
            }
            
            console.log(`Downloading recording ${recordingId}...`);
            
            const response = await axios({
                method: 'GET',
                url: downloadUrl,
                responseType: 'stream'
            });
            
            const filename = `recording_${recordingId}_${Date.now()}.mp4`;
            const filePath = path.join(outputPath, filename);
            const writer = fs.createWriteStream(filePath);
            
            response.data.pipe(writer);
            
            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`Recording downloaded to: ${filePath}`);
                    resolve(filePath);
                });
                writer.on('error', reject);
            });
            
        } catch (error) {
            console.error('Error downloading recording:', error.message);
            throw error;
        }
    }

    async listRecordingAccessInfo() {
        try {
            const recordings = await this.listRecordings();
            
            if (recordings.data && recordings.data.length > 0) {
                console.log('\n--- Recording Access Information ---');
                recordings.data.forEach((recording, index) => {
                    console.log(`\nRecording ${index + 1}:`);
                    console.log(`  ID: ${recording.id}`);
                    console.log(`  Status: ${recording.status}`);
                    console.log(`  Duration: ${recording.duration} seconds`);
                    console.log(`  Share Token: ${recording.share_token}`);
                    
                    const domain = process.env.DAILY_DOMAIN || 'api.daily.co';
                    const shareUrl = `https://${domain.replace('.daily.co', '')}.daily.co/rec/${recording.share_token}`;
                    console.log(`  Browser URL: ${shareUrl}`);
                    
                    if (recording.s3key) {
                        console.log(`  S3 Key: ${recording.s3key}`);
                    }
                });
            } else {
                console.log('No recordings found.');
            }
            
            return recordings;
        } catch (error) {
            console.error('Error listing recording access info:', error.message);
            throw error;
        }
    }

    async configureWebhook(webhookUrl) {
        try {
            console.log(`Configuring webhook: ${webhookUrl}`);
            const response = await dailyApi.post('/webhooks', {
                url: webhookUrl,
                events: ['recording-started', 'recording-done', 'recording-error']
            });
            
            console.log('Webhook configured:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error configuring webhook:', error.response?.data || error.message);
            throw new Error('Failed to configure webhook');
        }
    }

    async configureS3RecordingSettings(bucketName, bucketRegion, assumeRoleArn, allowApiAccess = true, allowStreamingFromBucket = false) {
        try {
            // Use values from .env if not provided
            bucketName = bucketName || process.env.RECORDING_BUCKET_NAME;
            bucketRegion = bucketRegion || process.env.RECORDING_BUCKET_REGION;
            assumeRoleArn = assumeRoleArn || process.env.RECORDING_ASSUME_ROLE_ARN;
            
            // Parse allowApiAccess from env if available
            if (!bucketName || !bucketRegion || !assumeRoleArn) {
                throw new Error('Missing S3 configuration. Please provide values as arguments or in .env file.');
            }
            
            // Parse allowApiAccess from env if available and not provided as argument
            if (allowApiAccess === true && process.env.RECORDING_ALLOW_API_ACCESS !== undefined) {
                allowApiAccess = process.env.RECORDING_ALLOW_API_ACCESS.toLowerCase() === 'true';
            }
            
            console.log('Configuring S3 recording settings...');
            console.log(`Bucket: ${bucketName}, Region: ${bucketRegion}`);
            console.log(`Role ARN: ${assumeRoleArn}, Allow API Access: ${allowApiAccess}, Allow Streaming From Bucket: ${allowStreamingFromBucket}`);
            
            // FIXED: Use the correct endpoint - POST to root '/' endpoint for domain configuration
            const response = await dailyApi.post('/', {
                properties: {
                    recordings_bucket: {
                        bucket_name: bucketName,
                        bucket_region: bucketRegion,
                        assume_role_arn: assumeRoleArn,
                        allow_api_access: allowApiAccess,
                        allow_streaming_from_bucket: allowStreamingFromBucket
                    }
                }
            });
            
            console.log('S3 recording settings configured:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error configuring S3 recording settings:', error.response?.data || error.message);
            throw new Error('Failed to configure S3 recording settings');
        }
    }
    async deleteRoom() {
        if (!this.roomName) {
            throw new Error('Room Name must be set before deleting');
        }
        
        try {
            console.log(`Deleting room: ${this.roomName}`);
            const response = await dailyApi.delete(`/rooms/${this.roomName}`);
            console.log('Room deleted:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error deleting room:', error.response?.data || error.message);
            throw new Error('Failed to delete room');
        }
    }

    async listRooms() {
        try {
            console.log('Listing all rooms...');
            const response = await dailyApi.get('/rooms');
            console.log('Rooms:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error listing rooms:', error.response?.data || error.message);
            throw new Error('Failed to list rooms');
        }
    }

    getMeetingUrl() {
        if (!this.roomName) {
            throw new Error('Room Name must be set before getting meeting URL');
        }
        
        const domain = process.env.DAILY_DOMAIN || 'api.daily.co';
        return `https://${domain}/${this.roomName}`;
    }
    
    getFullMeetingUrl(token) {
        const baseUrl = this.getMeetingUrl();
        return `${baseUrl}?t=${token}`;
    }
}

// Command line interface for testing
async function runTests() {
    const tester = new DailyTester();
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
        if (!command || command === 'help') {
            console.log(`
Daily.co API Tester
------------------
Available commands:
  node daily-test.js create-room        - Create a test room and generate tokens
  node daily-test.js list-rooms         - List all rooms in your domain
  node daily-test.js start-recording    - Start recording in the last created room
  node daily-test.js stop-recording     - Stop recording in the last created room
  node daily-test.js list-recordings    - List all recordings
  node daily-test.js access-recordings  - List recordings with access URLs
  node daily-test.js get-recording ID   - Get details of a specific recording by ID
  node daily-test.js get-share-url ID   - Get share URL for a recording
  node daily-test.js get-access-link ID [valid_for_secs] - Get streaming access link for a recording
  node daily-test.js room-recordings ROOM_NAME [valid_for_secs] - Get all recordings for a room with access links
  node daily-test.js get-download-url ID - Get download URL for a recording
  node daily-test.js download-recording ID [path] - Download a recording to local file
  node daily-test.js recordings-by-room ROOM_NAME - List recordings for a specific room
  node daily-test.js delete-room        - Delete the last created room
  node daily-test.js webhook URL        - Configure a webhook
  node daily-test.js configure-s3 [BUCKET_NAME] [BUCKET_REGION] [ASSUME_ROLE_ARN] [ALLOW_API_ACCESS] [ALLOW_STREAMING] - Configure S3 recording settings (uses .env if not provided)
            `);
            return;
        }

        // Always get domain config first
        await tester.getDomainConfig();
        
        switch (command) {
            case 'create-room':
                await tester.createRoom();
                const interviewerToken = tester.generateMeetingToken(true);
                const candidateToken = tester.generateMeetingToken(false);
                
                console.log('\n--- Meeting Information ---');
                console.log('Room Name:', tester.roomName);
                console.log('Meeting URL:', tester.getMeetingUrl());
                
                console.log('\n--- Interviewer Information ---');
                console.log('Token:', interviewerToken);
                console.log('Full URL:', tester.getFullMeetingUrl(interviewerToken));
                
                console.log('\n--- Candidate Information ---');
                console.log('Token:', candidateToken);
                console.log('Full URL:', tester.getFullMeetingUrl(candidateToken));
                
                // Save room info to a file for other commands to use
                fs.writeFileSync('room-info.json', JSON.stringify({
                    roomName: tester.roomName,
                    domainId: tester.domainId,
                    interviewerToken: interviewerToken,
                    candidateToken: candidateToken,
                    interviewerUrl: tester.getFullMeetingUrl(interviewerToken),
                    candidateUrl: tester.getFullMeetingUrl(candidateToken)
                }));
                break;
                
            case 'list-rooms':
                await tester.listRooms();
                break;
                
            case 'start-recording':
                // Load room info if available
                if (fs.existsSync('room-info.json')) {
                    const roomInfo = JSON.parse(fs.readFileSync('room-info.json'));
                    tester.roomName = roomInfo.roomName;
                    tester.domainId = roomInfo.domainId;
                    console.log(`Loaded room info: ${tester.roomName}`);
                } else {
                    throw new Error('No room info found. Create a room first.');
                }
                
                const recordingData = await tester.startRecording();
                
                // Save recording info
                fs.writeFileSync('recording-info.json', JSON.stringify({
                    recordingId: recordingData.id,
                    roomName: tester.roomName
                }));
                break;
                
            case 'stop-recording':
                // Load room and recording info
                if (fs.existsSync('room-info.json') && fs.existsSync('recording-info.json')) {
                    const roomInfo = JSON.parse(fs.readFileSync('room-info.json'));
                    const recordingInfo = JSON.parse(fs.readFileSync('recording-info.json'));
                    tester.roomName = roomInfo.roomName;
                    tester.recordingId = recordingInfo.recordingId;
                } else {
                    throw new Error('No room or recording info found.');
                }
                
                await tester.stopRecording();
                break;
                
            case 'list-recordings':
                // Load room info if available
                if (fs.existsSync('room-info.json')) {
                    const roomInfo = JSON.parse(fs.readFileSync('room-info.json'));
                    tester.roomName = roomInfo.roomName;
                    console.log(`Loaded room info: ${tester.roomName}`);
                }
                
                await tester.listRecordings();
                break;

            case 'access-recordings':
                // Load room info if available
                if (fs.existsSync('room-info.json')) {
                    const roomInfo = JSON.parse(fs.readFileSync('room-info.json'));
                    tester.roomName = roomInfo.roomName;
                }
                await tester.listRecordingAccessInfo();
                break;

            case 'download-recording':
                const downloadRecordingId = args[1];
                const outputPath = args[2] || './recordings/';
                if (!downloadRecordingId) {
                    throw new Error('Recording ID is required. Usage: node daily-test.js download-recording ID [output-path]');
                }
                await tester.downloadRecording(downloadRecordingId, outputPath);
                break;

            case 'get-download-url':
                const urlRecordingId = args[1];
                if (!urlRecordingId) {
                    throw new Error('Recording ID is required. Usage: node daily-test.js get-download-url ID');
                }
                await tester.getRecordingDownloadUrl(urlRecordingId);
                break;
                
            case 'get-recording':
                const recordingId = args[1];
                if (!recordingId) {
                    throw new Error('Recording ID is required. Usage: node daily-test.js get-recording ID');
                }
                await tester.getRecordingById(recordingId);
                break;
                
            case 'get-share-url':
                const shareRecordingId = args[1];
                if (!shareRecordingId) {
                    throw new Error('Recording ID is required. Usage: node daily-test.js get-share-url ID');
                }
                const recording = await tester.getRecordingById(shareRecordingId);
                if (recording.share_token) {
                    await tester.getRecordingShareUrl(recording.share_token);
                } else {
                    console.log('No share token available for this recording');
                }
                break;
                
            case 'get-access-link':
                const accessRecordingId = args[1];
                if (!accessRecordingId) {
                    throw new Error('Recording ID is required. Usage: node daily-test.js get-access-link ID [valid_for_secs]');
                }
                const validForSecs = args[2] ? parseInt(args[2]) : 3600;
                await tester.getRecordingAccessLink(accessRecordingId, validForSecs);
                break;
                
            case 'room-recordings':
                const roomNameForRecordings = args[1];
                if (!roomNameForRecordings) {
                    throw new Error('Room name is required. Usage: node daily-test.js room-recordings ROOM_NAME [valid_for_secs]');
                }
                const validForSecsForRoom = args[2] ? parseInt(args[2]) : 3600;
                await tester.getRoomRecordingsWithAccessLinks(roomNameForRecordings, validForSecsForRoom);
                break;
                
            case 'recordings-by-room':
                const roomName = args[1];
                if (!roomName) {
                    throw new Error('Room name is required. Usage: node daily-test.js recordings-by-room ROOM_NAME');
                }
                await tester.listRecordingsByRoom(roomName);
                break;
                
            case 'delete-room':
                // Load room info
                if (fs.existsSync('room-info.json')) {
                    const roomInfo = JSON.parse(fs.readFileSync('room-info.json'));
                    tester.roomName = roomInfo.roomName;
                    console.log(`Loaded room info: ${tester.roomName}`);
                    await tester.deleteRoom();
                    
                    // Clean up info files
                    fs.unlinkSync('room-info.json');
                    if (fs.existsSync('recording-info.json')) {
                        fs.unlinkSync('recording-info.json');
                    }
                } else {
                    throw new Error('No room info found.');
                }
                break;
                
            case 'webhook':
                const webhookUrl = args[1];
                if (!webhookUrl) {
                    throw new Error('Webhook URL is required. Usage: node daily-test.js webhook URL');
                }
                await tester.configureWebhook(webhookUrl);
                break;
                
            case 'configure-s3':
                const bucketName = args[1] || null;
                const bucketRegion = args[2] || null;
                const assumeRoleArn = args[3] || null;
                const allowApiAccess = args[4] ? args[4].toLowerCase() === 'true' : true;
                const allowStreamingFromBucket = args[5] ? args[5].toLowerCase() === 'true' : false;
                
                await tester.configureS3RecordingSettings(bucketName, bucketRegion, assumeRoleArn, allowApiAccess, allowStreamingFromBucket);
                break;
                
            default:
                console.log(`Unknown command: ${command}`);
                console.log('Run "node daily-test.js help" for available commands');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run the tests
runTests();

// Export for use in other files
export default DailyTester;