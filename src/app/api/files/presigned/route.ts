import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from '@/lib/auth';
import { isR2Enabled, getSignedUploadUrl, headObjectFromR2, getR2PublicUrl } from '@/lib/storage/r2Adapter';
import { logInfo, logError } from '@/lib/storage/logger';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isR2Enabled()) {
      return NextResponse.json({ directUpload: false, reason: 'R2 not enabled' });
    }

    const body = await request.json();
    const { filename, size, mimeType, type = 'upload' } = body;

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const sanitizedName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const uniqueName = `${Date.now()}_${uuidv4()}_${sanitizedName}`;
    const subFolder = type === 'avatar' ? 'avatars' : 'uploads';
    const key = `${subFolder}/${uniqueName}`;
    const effectiveMimeType = mimeType || 'application/octet-stream';

    const uploadUrl = await getSignedUploadUrl(key, effectiveMimeType, 3600);

    return NextResponse.json({
      directUpload: true,
      uploadUrl,
      key,
      name: sanitizedName,
      savedName: uniqueName,
      type,
    });
  } catch (error: any) {
    console.error('Presigned URL generation error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate presigned upload URL' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { key, name, savedName, size, mimeType, type = 'upload' } = body;

    if (!key || !name || !savedName) {
      return NextResponse.json({ error: 'Missing required file details' }, { status: 400 });
    }

    // Verify object exists in R2
    let finalSize = size;
    const r2Head = await headObjectFromR2(key);
    if (r2Head && r2Head.size > 0) {
      finalSize = r2Head.size;
    }

    await logInfo('FILE', `Direct R2 file upload completed by ${user.username}: ${name} (${savedName})`, {
      originalName: name,
      savedName,
      sizeBytes: finalSize,
      mimeType,
      type,
      key,
    });

    const fileUrl = getR2PublicUrl(key);

    return NextResponse.json({
      id: uuidv4(),
      name,
      savedName,
      url: fileUrl,
      size: finalSize,
      mimeType: mimeType || 'application/octet-stream',
    });
  } catch (error: any) {
    console.error('Presigned upload registration error:', error);
    return NextResponse.json({ error: error.message || 'Failed to register completed upload' }, { status: 500 });
  }
}
