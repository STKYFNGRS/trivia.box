import { NextRequest, NextResponse } from 'next/server';

const rpcUrl = process.env.NEXT_PRIVATE_RPC_URL;

export async function POST(req: NextRequest) {
  console.log('RPC URL:', rpcUrl);

  if (rpcUrl === undefined) {
    return NextResponse.json(
      {},
      {
        status: 401,
        statusText:
          'You need a RPC URL! Get yours at https://www.coinbase.com/developer-platform/products/base-node?utm_source=boat',
      },
    );
  }

  const requestMethod = req.method;
  let requestBody = req.body;

  // Remove the request body if the method is GET or HEAD
  if (requestMethod === 'GET' || requestMethod === 'HEAD') {
    requestBody = null;
  }

  // Create a new Headers instance and copy the headers from req.headers
  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    headers.set(key, value);
  }

  // forward to Coinbase Developer Platform RPC
  return fetch(rpcUrl, {
    method: requestMethod,
    body: requestBody,
    headers,
  })
    .then(async (response) => {
      // Return the response data to the client
      const webResp = new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      return webResp;
    })
    .catch((error) => {
      console.error('Error:', error);
      return NextResponse.json({}, { status: 500, statusText: 'Internal Server Error' });
    });
}
