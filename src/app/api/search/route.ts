import { NextRequest, NextResponse } from 'next/server';
import { searchMessages } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';

// GET: Run a multi-faceted global message search
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const username = searchParams.get('username') || undefined;
    const chatId = searchParams.get('chatId') || undefined;
    const dateStart = searchParams.get('dateStart') || undefined;
    const dateEnd = searchParams.get('dateEnd') || undefined;
    const hasAttachment = searchParams.get('hasAttachment') === 'true';

    const results = await searchMessages(user.id, query, {
      username,
      chatId,
      dateStart,
      dateEnd,
      hasAttachment
    });

    return NextResponse.json(results);

  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
