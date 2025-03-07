import { NextResponse } from 'next/dist/server/web/spec-extension/response';
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
    
    // We'll skip trying to get enum values directly from Prisma types
    // and just use a sample query instead
    const sampleCategories = await prisma.$queryRaw`
      SELECT DISTINCT category 
      FROM trivia_questions 
      LIMIT 10
    `;
    console.log('API: Sample categories from database:', sampleCategories);
    
    return NextResponse.json({
      success: true,
      connectionTest: 'successful',
      tables: tableNames,
      questionCount,
      sampleCategories
    });
  } catch (error) {
    console.error('API: Database test error:', error);
    
    let errorMessage = 'Unknown error';
    let errorDetails: string | null = null;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || null;
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: errorDetails
    }, { status: 500 });
  }
}