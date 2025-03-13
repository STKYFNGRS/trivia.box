import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * API route that proxies RPC requests to overcome CORS issues on mobile
 * This is specifically designed to address wallet connection issues when
 * connecting to LlamaRPC endpoints from mobile devices.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Parse request body
    const { endpoint, payload } = req.body;
    
    // Validate required parameters
    if (!endpoint || !payload) {
      return res.status(400).json({ 
        error: 'Missing required parameters: endpoint and payload' 
      });
    }
    
    // Whitelist of allowed RPC endpoints
    const allowedEndpoints: Record<string, string> = {
      'eth': 'https://eth.llamarpc.com',
      'base': 'https://base.llamarpc.com',
      'arbitrum': 'https://arbitrum.llamarpc.com',
      'polygon': 'https://polygon.llamarpc.com',
      'optimism': 'https://optimism.llamarpc.com',
      'sepolia': 'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      'ethereum': 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'
    };
    
    // Ensure requested endpoint is in allowlist
    const targetUrl = allowedEndpoints[endpoint];
    if (!targetUrl) {
      return res.status(400).json({ error: 'Invalid or unsupported endpoint' });
    }
    
    // Forward the request to the actual RPC endpoint
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    // Get the response data
    const data = await response.json();
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    
    // Return the proxied response
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('RPC proxy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
