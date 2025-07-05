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

async function forceDeleteWebhook() {
    const webhookUuid = 'bce1a814-3122-400a-9491-1010cf5cb108';
    
    try {
        console.log(`Attempting to delete webhook: ${webhookUuid}`);
        
        const response = await dailyApi.delete(`/webhooks/${webhookUuid}`);
        console.log('✅ Webhook deleted successfully:', response.data);
        
        // Wait a moment for deletion to propagate
        console.log('Waiting for deletion to propagate...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify deletion
        console.log('Verifying deletion...');
        const listResponse = await dailyApi.get('/webhooks');
        
        if (listResponse.data.data && listResponse.data.data.length > 0) {
            console.log('⚠️  Remaining webhooks:', listResponse.data.data.length);
            listResponse.data.data.forEach(webhook => {
                console.log(`  - ${webhook.uuid}: ${webhook.url}`);
            });
        } else {
            console.log('✅ No webhooks remaining - deletion successful!');
        }
        
    } catch (error) {
        console.error('❌ Error deleting webhook:', error.response?.data || error.message);
        
        if (error.response?.status === 404) {
            console.log('✅ Webhook not found - it may already be deleted');
        }
    }
}

forceDeleteWebhook();