import { NextRequest, NextResponse } from 'next/server';
import { readLogs, LogLevel, LogCategory } from '@/lib/storage/logger';
import { getCurrentUser } from '@/lib/auth';

// GET: Read structured logs with filtering and pagination (restricted to Admin)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || '50');
    const offset = Number(searchParams.get('offset') || '0');
    const level = searchParams.get('level') as LogLevel | undefined;
    const category = searchParams.get('category') as LogCategory | undefined;
    const query = searchParams.get('query') || undefined;

    const logsData = await readLogs({
      limit,
      offset,
      level,
      category,
      query
    });

    return NextResponse.json(logsData);

  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
