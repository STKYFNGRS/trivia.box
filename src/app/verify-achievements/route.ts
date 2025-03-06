import { NextResponse } from 'next/dist/server/web/spec-extension/response';

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Achievement verification will happen automatically during gameplay.'
  });
}