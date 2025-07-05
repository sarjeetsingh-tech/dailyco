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
        return response.data;
    } catch (error) {
        console.error('Error listing webhooks:', error.response?.data || error.message);
        throw error;
    }
}

// Run the script
listWebhooks()
    .then(() => console.log('Done'))
    .catch(err => console.error('Error:', err.message)); 