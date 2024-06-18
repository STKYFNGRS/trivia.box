import axios from 'axios';
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
    const response = await axios({
      method: 'POST',
      url: rpcUrl,
      headers: req.headers,
      data: req.body,
    });

    // Return the response data to the client
    return NextResponse.json(response.data, {
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    console.error('Error:', error.message);

    // Return a 500 Internal Server Error response
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error.message,
      },
      {
        status: 500,
        statusText: 'Internal Server Error',
      },
    );
  }
}
