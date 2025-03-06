import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';
import { AchievementService } from '@/services/achievements/AchievementService';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
  }
  
  console.log(`Verifying achievements for wallet: ${wallet}`);
  
  try {
    // Get user by wallet - normalize the wallet address to handle case sensitivity
    const normalizedWallet = wallet.toLowerCase();
    console.log(`Searching for user with normalized wallet: ${normalizedWallet}`);
    
    const user = await prisma.trivia_users.findFirst({
      where: {
        wallet_address: {
          contains: normalizedWallet,
          mode: 'insensitive'
        }
      }
    });
    
    if (!user) {
      console.log(`User not found for wallet: ${wallet}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    console.log(`Found user ID ${user.id} for wallet ${wallet}`);
    
    // Use the AchievementService to verify achievements
    const achievementService = AchievementService.getInstance();
    const verificationResults = await achievementService.verifyUserAchievements(user.id);
    
    return NextResponse.json({
      success: true,
      userId: user.id,
      gamesPlayed: user.games_played,
      bestStreak: user.best_streak,
      ...verificationResults
    });
    
  } catch (error) {
    console.error('Error verifying achievements:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}