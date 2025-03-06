// This route is used to disable the debug UI features
import { NextResponse } from 'next/dist/server/web/spec-extension/response';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ 
    enabled: false,
    message: 'Debug features have been disabled'
  });
}