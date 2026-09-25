import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { 
      error: 'Username and password login has been disabled by the system owner. Please sign in using your authorized Google account.' 
    }, 
    { status: 403 }
  );
}
