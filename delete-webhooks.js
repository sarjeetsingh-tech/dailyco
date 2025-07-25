import dotenv from 'dotenv';
import axios from 'axios';

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

async function listWebhooks() {
    try {
        console.log('Listing current webhooks...');
        const response = await dailyApi.get('/webhooks');
        console.log('Raw API response:', JSON.stringify(response.data, null, 2));
        
        // Handle both possible response formats
        if (response.data && response.data.data) {
            // New API format with data.data structure
            return response.data.data;
        } else if (Array.isArray(response.data)) {
            // Old API format with direct array
            return response.data;
        } else {
            console.log('Unexpected API response format:', response.data);
            return [];
        }
    } catch (error) {
        console.error('Error listing webhooks:', error.response?.data || error.message);
        throw error;
    }
}

async function deleteWebhook(webhookId) {
    try {
        console.log(`Deleting webhook with ID: ${webhookId}`);
        await dailyApi.delete(`/webhooks/${webhookId}`);
        console.log(`✅ Deleted webhook: ${webhookId}`);
    } catch (error) {
        console.error(`❌ Error deleting webhook ${webhookId}:`, error.response?.data || error.message);
    }
}

async function deleteAllWebhooks() {
    try {
        const webhooks = await listWebhooks();
        
        if (!webhooks || webhooks.length === 0) {
            console.log('No webhooks found to delete.');
            return;
        }
        
        console.log(`Found ${webhooks.length} webhooks:`);
        webhooks.forEach(webhook => {
            // Handle both possible ID field names (uuid or id)
            const id = webhook.uuid || webhook.id;
            console.log(`- ${id}: ${webhook.url} (${webhook.state})`);
        });
        
        console.log('\nDeleting all webhooks...');
        
        for (const webhook of webhooks) {
            // Handle both possible ID field names (uuid or id)
            const id = webhook.uuid || webhook.id;
            await deleteWebhook(id);
        }
        
        console.log('\n✅ All webhooks deleted successfully');
    } catch (error) {
        console.error('❌ Error during webhook deletion:', error.message);
    }
}

// Run the script
deleteAllWebhooks(); 