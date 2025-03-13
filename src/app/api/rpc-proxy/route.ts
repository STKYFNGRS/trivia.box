import { NextRequest, NextResponse } from 'next/server';

/**
 * API route that proxies RPC requests to overcome CORS issues on mobile
 * This is specifically designed to address wallet connection issues when
 * connecting to LlamaRPC endpoints from mobile devices.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the incoming request
    const body = await request.json();
    const { endpoint, payload } = body;
    
    // Validate required parameters
    if (!endpoint || !payload) {
      return NextResponse.json(
        { error: 'Missing required parameters: endpoint and payload' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Invalid or unsupported endpoint' },
        { status: 400 }
      );
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
    
    // Return the proxied response
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('RPC proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
