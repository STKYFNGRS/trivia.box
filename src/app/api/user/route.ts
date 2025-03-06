import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { prisma } from '@/lib/db/client';

// Mark as dynamic route to avoid static generation errors
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const walletAddress = searchParams.get('address');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }

    let user = await prisma.trivia_users.findUnique({
      where: { wallet_address: walletAddress }
    });

    if (!user) {
      user = await prisma.trivia_users.create({
        data: {
          wallet_address: walletAddress,
          total_points: 0n,
          games_played: 0
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        total_points: Number(user.total_points) // Convert BigInt to Number for JSON
      }
    });
  } catch (error) {
    console.error('Failed to fetch/create user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}