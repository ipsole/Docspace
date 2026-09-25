import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';
import { logInfo, logError } from '@/lib/storage/logger';

// GET: Fetch server settings
export async function GET(request: NextRequest) {
  try {
    const settings = await getSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT: Save server settings (Admin only)
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { serverName, allowRegistration, maxUploadSizeMb, allowedMimeTypes } = body;

    const currentSettings = await getSettings();

    const updatedSettings = {
      serverName: serverName !== undefined ? serverName.trim() : currentSettings.serverName,
      allowRegistration: allowRegistration !== undefined ? !!allowRegistration : currentSettings.allowRegistration,
      maxUploadSizeMb: maxUploadSizeMb !== undefined ? Number(maxUploadSizeMb) : currentSettings.maxUploadSizeMb,
      allowedMimeTypes: allowedMimeTypes !== undefined ? allowedMimeTypes : currentSettings.allowedMimeTypes
    };

    if (updatedSettings.maxUploadSizeMb <= 0) {
      return NextResponse.json({ error: 'Max upload size must be greater than 0MB' }, { status: 400 });
    }

    await saveSettings(updatedSettings);
    await logInfo('ADMIN', 'Server settings updated', { updatedSettings });

    return NextResponse.json(updatedSettings);

  } catch (error: any) {
    await logError('ADMIN', 'Settings update failed', { error: error.message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
