import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    console.log('API: Testing database connection...');
    
    // Try basic connection test
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('API: Basic connection successful:', result);
    
    // Try to list all tables
    const tableNames = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log('API: Tables in database:', tableNames);
    
    // Try to count records in trivia_questions table
    const questionCount = await prisma.trivia_questions.count();
    console.log(`API: Number of questions in database: ${questionCount}`);
    
    // Try to get one category from each enum
    const categoryList = Object.values(prisma.$type.trivia_category)[0];
    console.log('API: Available categories:', categoryList);
    
    return NextResponse.json({
      success: true,
      connectionTest: 'successful',
      tables: tableNames,
      questionCount,
      categories: categoryList
    });
  } catch (error) {
    console.error('API: Database test error:', error);
    
    let errorMessage = 'Unknown error';
    let errorDetails = null;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack;
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: errorDetails
    }, { status: 500 });
  }
}