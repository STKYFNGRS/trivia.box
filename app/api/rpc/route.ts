import { NextRequest, NextResponse } from 'next/server';

const rpcUrl = process.env.NEXT_PRIVATE_RPC_URL;

export async function POST(req: NextRequest) {
  if (rpcUrl === undefined) {
    return NextResponse.json(
      {},
      {
        status: 401,
        statusText:
          'You need an RPC URL! Get yours at https://www.coinbase.com/developer-platform/products/base-node?utm_source=boat',
      },
    );
  }

  try {
    // Forward the request to the Coinbase Developer Platform RPC
    const response = await fetch(rpcUrl, {
      method: req.method,
      headers: req.headers,
      body: req.body as BodyInit, // Type assertion to ensure body is correctly typed
    });

    // Check if the response is OK (status code 2xx)
    if (!response.ok) {
      throw new Error(`Fetch error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as Record<string, unknown>; // Ensure the response data is typed

    // Return the response data to the client
    return NextResponse.json(data, {
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    console.error('Error:', (error as Error).message);

    // Return a 500 Internal Server Error response
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      {
        status: 500,
        statusText: 'Internal Server Error',
      },
    );
  }
}
