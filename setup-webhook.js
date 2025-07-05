import dotenv from 'dotenv';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Create axios instance for Daily.co API
const dailyApi = axios.create({
    baseURL: 'https://api.daily.co/v1/',
    headers: {
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

class WebhookSetup {
    constructor() {
        this.webhookUrl = process.env.WEBHOOK_URL || `http://localhost:${process.env.WEBHOOK_PORT || 3001}/webhook`;
        this.webhookSecret = process.env.DAILY_WEBHOOK_SECRET;
        
        // If webhook URL has /webhook at the end, remove it for Daily.co
        // Daily.co will test the base URL, not the /webhook endpoint
        if (this.webhookUrl.endsWith('/webhook')) {
            this.webhookUrl = this.webhookUrl.replace('/webhook', '');
        }
    }

    // Generate a random webhook secret if not provided
    generateWebhookSecret() {
        return crypto.randomBytes(32).toString('base64');
    }

    // Update .env file with new webhook secret
    updateEnvFile() {
        try {
            const envPath = '.env';
            let envContent = '';
            
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
            }
            
            // Replace or add the webhook secret
            if (envContent.includes('DAILY_WEBHOOK_SECRET=')) {
                envContent = envContent.replace(
                    /DAILY_WEBHOOK_SECRET=.*/,
                    `DAILY_WEBHOOK_SECRET=${this.webhookSecret}`
                );
            } else {
                envContent += `\nDAILY_WEBHOOK_SECRET=${this.webhookSecret}\n`;
            }
            
            fs.writeFileSync(envPath, envContent);
            console.log('✅ Updated .env file with new webhook secret');
        } catch (error) {
            console.error('⚠️  Could not update .env file:', error.message);
            console.log(`Please manually add this to your .env file:`);
            console.log(`DAILY_WEBHOOK_SECRET=${this.webhookSecret}`);
        }
    }

    // Create or update webhook configuration
    async setupWebhook() {
        try {
            // If no webhook secret exists or it's the placeholder, generate one
            if (!this.webhookSecret || this.webhookSecret === 'your_webhook_secret_here') {
                this.webhookSecret = this.generateWebhookSecret();
                console.log('Generated new webhook secret:', this.webhookSecret);
                console.log('Please add this to your .env file as DAILY_WEBHOOK_SECRET');
                
                // Update the .env file automatically
                this.updateEnvFile();
            }

            console.log(`Setting up webhook: ${this.webhookUrl}`);
            
            // List existing webhooks first
            let existingWebhooks;
            try {
                const response = await dailyApi.get('/webhooks');
                existingWebhooks = response.data;
                console.log('Existing webhooks:', existingWebhooks);
            } catch (error) {
                console.log('No existing webhooks found or error fetching:', error.response?.data || error.message);
                existingWebhooks = { data: [] };
            }

            // Delete existing webhooks if any
            if (existingWebhooks.data && existingWebhooks.data.length > 0) {
                for (const webhook of existingWebhooks.data) {
                    try {
                        console.log(`Deleting existing webhook: ${webhook.id}`);
                        await dailyApi.delete(`/webhooks/${webhook.id}`);
                        console.log('Deleted webhook:', webhook.id);
                    } catch (error) {
                        console.error('Error deleting webhook:', error.response?.data || error.message);
                    }
                }
            }

            // Create new webhook
            const webhookConfig = {
                url: this.webhookUrl,
                eventTypes: [
                    'recording.started',
                    'recording.ready-to-download', 
                    'recording.error'
                ]
            };

            // Only add hmac if we have a valid secret
            if (this.webhookSecret && this.webhookSecret !== 'your_webhook_secret_here') {
                webhookConfig.hmac = this.webhookSecret;
            }

            console.log('Creating webhook with config:', { ...webhookConfig, hmac: '[HIDDEN]' });
            
            const response = await dailyApi.post('/webhooks', webhookConfig);
            
            console.log('✅ Webhook configured successfully!');
            console.log('Webhook ID:', response.data.id);
            console.log('Webhook URL:', response.data.url);
            console.log('Webhook Events:', response.data.eventTypes);
            console.log('Webhook State:', response.data.state);
            
            // Save webhook info to file
            const webhookInfo = {
                id: response.data.id,
                url: response.data.url,
                eventTypes: response.data.eventTypes,
                state: response.data.state,
                created_at: new Date().toISOString(),
                hmac_secret: this.webhookSecret
            };
            
            fs.writeFileSync('webhook-info.json', JSON.stringify(webhookInfo, null, 2));
            console.log('Webhook info saved to webhook-info.json');
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Error setting up webhook:', error.response?.data || error.message);
            
            if (error.response?.status === 400) {
                console.log('\n🔧 Troubleshooting tips:');
                console.log('1. Make sure your webhook server is running and accessible');
                console.log('2. Check if the webhook URL is correct and reachable');
                console.log('3. Ensure your webhook endpoint returns a 200 status code');
                console.log('4. If testing locally, consider using ngrok to expose your local server');
            }
            
            throw error;
        }
    }

    // Test webhook endpoint
    async testWebhookEndpoint() {
        try {
            console.log(`Testing webhook endpoint: ${this.webhookUrl}`);
            
            // Remove /webhook from URL for health check
            const baseUrl = this.webhookUrl.replace('/webhook', '');
            const healthUrl = `${baseUrl}/health`;
            
            const response = await axios.get(healthUrl, { timeout: 5000 });
            console.log('✅ Webhook endpoint is accessible');
            console.log('Health check response:', response.data);
            return true;
        } catch (error) {
            console.error('❌ Webhook endpoint test failed:', error.message);
            console.log('\n🔧 Make sure your webhook server is running:');
            console.log('   npm start');
            console.log('   or');
            console.log('   node webhook-server.js');
            return false;
        }
    }

    // List current webhooks
    async listWebhooks() {
        try {
            console.log('Listing current webhooks...');
            const response = await dailyApi.get('/webhooks');
            
            if (response.data.data && response.data.data.length > 0) {
                console.log('Current webhooks:');
                response.data.data.forEach((webhook, index) => {
                    console.log(`\nWebhook ${index + 1}:`);
                    console.log(`  ID: ${webhook.id}`);
                    console.log(`  URL: ${webhook.url}`);
                    console.log(`  State: ${webhook.state}`);
                    console.log(`  Events: ${webhook.eventTypes?.join(', ')}`);
                    console.log(`  Created: ${webhook.created_at}`);
                    console.log(`  Failures: ${webhook.failures || 0}`);
                });
            } else {
                console.log('No webhooks configured');
            }
            
            return response.data;
        } catch (error) {
            console.error('Error listing webhooks:', error.response?.data || error.message);
            throw error;
        }
    }

    // Delete all webhooks
    async deleteAllWebhooks() {
        try {
            const webhooks = await this.listWebhooks();
            
            if (webhooks.data && webhooks.data.length > 0) {
                for (const webhook of webhooks.data) {
                    console.log(`Deleting webhook: ${webhook.id}`);
                    await dailyApi.delete(`/webhooks/${webhook.id}`);
                    console.log(`✅ Deleted webhook: ${webhook.id}`);
                }
            } else {
                console.log('No webhooks to delete');
            }
        } catch (error) {
            console.error('Error deleting webhooks:', error.response?.data || error.message);
            throw error;
        }
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!process.env.DAILY_API_KEY) {
        console.error('❌ Error: DAILY_API_KEY is not set in .env file');
        process.exit(1);
    }

    const setup = new WebhookSetup();
    
    try {
        switch (command) {
            case 'setup':
            case 'create':
                console.log('🔧 Setting up Daily.co webhook...\n');
                
                // Test endpoint first
                const isAccessible = await setup.testWebhookEndpoint();
                if (!isAccessible) {
                    console.log('\n⚠️  Webhook endpoint is not accessible, but continuing with setup...');
                    console.log('Make sure to start your webhook server after setup.');
                }
                
                await setup.setupWebhook();
                break;
                
            case 'list':
                await setup.listWebhooks();
                break;
                
            case 'delete':
                await setup.deleteAllWebhooks();
                break;
                
            case 'test':
                await setup.testWebhookEndpoint();
                break;
                
            case 'help':
            default:
                console.log(`
Daily.co Webhook Setup
---------------------
Available commands:
  node setup-webhook.js setup   - Create webhook configuration
  node setup-webhook.js list    - List current webhooks  
  node setup-webhook.js delete  - Delete all webhooks
  node setup-webhook.js test    - Test webhook endpoint accessibility

Environment variables needed:
  DAILY_API_KEY           - Your Daily.co API key
  WEBHOOK_URL (optional)  - Your webhook URL (defaults to http://localhost:3001/webhook)
  DAILY_WEBHOOK_SECRET    - Webhook secret for signature verification (auto-generated if not set)
                `);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();