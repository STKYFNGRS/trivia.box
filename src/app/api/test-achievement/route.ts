import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { ACHIEVEMENT_DISPLAY } from '@/types/achievements';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'PERFECT_ROUND';
    
    // Check if this is a valid achievement type
    if (!ACHIEVEMENT_DISPLAY[type]) {
      return NextResponse.json({
        success: false,
        error: `Unknown achievement type: ${type}`
      }, { status: 400 });
    }
    
    // Return the achievement data so frontend can trigger a test notification
    return NextResponse.json({
      success: true,
      achievementData: {
        type: type,
        display: ACHIEVEMENT_DISPLAY[type],
        userId: 1
      }
    });
    
  } catch (error) {
    console.error('Error in test achievement route:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}