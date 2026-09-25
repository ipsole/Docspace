import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { 
      error: 'Public registration is disabled. Workspace access is restricted to pre-authorized Google accounts only.' 
    }, 
    { status: 403 }
  );
}
