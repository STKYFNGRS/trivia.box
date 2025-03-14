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
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    // Set CORS headers for preflight request
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    return res.status(204).end();
  }
  
  // Only allow POST requests for actual data
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Parse request body
    const { endpoint, payload, directUrl } = req.body;
    
    // Validate required parameters
    if ((!endpoint && !directUrl) || !payload) {
      return res.status(400).json({ 
        error: 'Missing required parameters: either endpoint or directUrl, and payload' 
      });
    }
    
    // Whitelist of allowed RPC endpoints
    const allowedEndpoints: Record<string, string> = {
      'eth': 'https://eth.llamarpc.com',
      'base': 'https://base.llamarpc.com',
      'base-publicnode': 'https://base.publicnode.com',
      'arbitrum': 'https://arbitrum.llamarpc.com',
      'polygon': 'https://polygon.llamarpc.com',
      'optimism': 'https://optimism.llamarpc.com',
      'sepolia': 'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      'ethereum': 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'
    };
    
    let targetUrl: string;
    
    // If directUrl is provided and it's a valid URL, use it directly
    if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('https://')) {
      // Extract domain to check against allowlist
      try {
        const url = new URL(directUrl);
        const domain = url.hostname;
        
        // Check if domain is in our allowlist
        const allowedDomains = [
          'llamarpc.com',
          'infura.io',
          'publicnode.com',
          'polygon-rpc.com',
          'optimism.io',
          'base.org'
        ];
        
        if (!allowedDomains.some(allowed => domain.includes(allowed))) {
          return res.status(400).json({ error: 'Direct URL domain not allowed' });
        }
        
        targetUrl = directUrl;
      } catch {
        return res.status(400).json({ error: 'Invalid direct URL' });
      }
    } else {
      // Use the endpoint mapping
      targetUrl = allowedEndpoints[endpoint];
      if (!targetUrl) {
        return res.status(400).json({ error: 'Invalid or unsupported endpoint' });
      }
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
