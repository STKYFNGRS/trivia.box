import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';
import { ACHIEVEMENT_DISPLAY } from '@/types/achievements';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
  }
  
  console.log(`Force-achievement API called for wallet: ${wallet}`);
  
  try {
    // Get user by wallet - normalize the wallet address
    const normalizedWallet = wallet.toLowerCase();
    console.log(`Searching for user with normalized wallet: ${normalizedWallet}`);
    
    const user = await prisma.trivia_users.findFirst({
      where: {
        wallet_address: {
          contains: normalizedWallet,
          mode: 'insensitive'
        }
      },
      select: { id: true }
    });
    
    if (!user) {
      console.log(`User not found for wallet: ${wallet}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    console.log(`Found user ID ${user.id} for wallet ${wallet}`);
    
    // Check if achievement already exists
    const existingAchievement = await prisma.trivia_achievements.findFirst({
      where: {
        user_id: user.id,
        achievement_type: 'BLOCKCHAIN_PIONEER'
      }
    });
    
    if (!existingAchievement) {
      // Create the achievement
      console.log(`Creating Blockchain Pioneer achievement for user ${user.id} with wallet ${wallet}`);
      await prisma.trivia_achievements.create({
        data: {
          user_id: user.id,
          achievement_type: 'BLOCKCHAIN_PIONEER',
          score: 1,
          week_number: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000),
          year: new Date().getFullYear(),
          minted_at: new Date()
        }
      });
      
      return NextResponse.json({
        success: true,
        message: 'Blockchain Pioneer achievement created',
        user_id: user.id
      });
    }
    
    console.log(`Blockchain Pioneer achievement already exists for user ${user.id}`);
    return NextResponse.json({
      success: true,
      message: 'Blockchain Pioneer achievement already exists',
      user_id: user.id
    });
    
  } catch (error) {
    console.error('Error creating achievement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}