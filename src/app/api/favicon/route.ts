import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    // Read the favicon file from the public directory
    const filePath = join(process.cwd(), 'public', 'favicon.ico');
    const fileBuffer = readFileSync(filePath);
    
    // Return the favicon with proper headers
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/x-icon',
        'Cache-Control': 'public, max-age=86400, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Error serving favicon:', error);
    return new Response(null, { status: 404 });
  }
}
