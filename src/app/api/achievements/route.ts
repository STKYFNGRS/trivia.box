import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';
import { AchievementService } from '@/services/achievements/AchievementService';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  try {
    // If no wallet, return error
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // Get user by wallet - normalize the wallet address
    const normalizedWallet = wallet.toLowerCase();
    console.log(`Fetching achievements for normalized wallet: ${normalizedWallet}`);
    
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

    // Use the AchievementService to get achievements
    const achievementService = AchievementService.getInstance();
    const achievements = await achievementService.getUserAchievements(user.id);

    return NextResponse.json({ achievements });
  } catch (error) {
    console.error('Failed to fetch achievements:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}