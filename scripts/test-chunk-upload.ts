import fs from 'fs/promises';
import path from 'path';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
const TEST_USER_ID = 'test-user-chunk-id';
const TEST_SESSION_ID = 'test-session-chunk-id';

async function setupTestData() {
  console.log('⏳ Setting up test user and session...');
  
  const testUser = {
    id: TEST_USER_ID,
    username: 'test_chunk_user',
    displayName: 'Test Chunk User',
    email: 'chunk@example.com',
    passwordHash: 'dummy',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    avatar: null,
    status: 'online',
    role: 'user',
    bio: 'Test user for chunked uploads'
  };

  const testSession = {
    id: TEST_SESSION_ID,
    userId: TEST_USER_ID,
    username: 'test_chunk_user',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
  };

  await fs.mkdir(path.join(STORAGE_ROOT, 'users'), { recursive: true });
  await fs.mkdir(path.join(STORAGE_ROOT, 'sessions'), { recursive: true });

  await fs.writeFile(
    path.join(STORAGE_ROOT, 'users', `${TEST_USER_ID}.json`),
    JSON.stringify(testUser, null, 2)
  );
  await fs.writeFile(
    path.join(STORAGE_ROOT, 'sessions', `${TEST_SESSION_ID}.json`),
    JSON.stringify(testSession, null, 2)
  );

  console.log('✅ Test user and session set up successfully.');
}

async function cleanupTestData(savedName: string | null) {
  console.log('⏳ Cleaning up test data...');
  await fs.unlink(path.join(STORAGE_ROOT, 'users', `${TEST_USER_ID}.json`)).catch(() => {});
  await fs.unlink(path.join(STORAGE_ROOT, 'sessions', `${TEST_SESSION_ID}.json`)).catch(() => {});
  if (savedName) {
    await fs.unlink(path.join(STORAGE_ROOT, 'uploads', savedName)).catch(() => {});
  }
  console.log('✅ Cleanup complete.');
}

async function runTest() {
  await setupTestData();
  
  const serverUrl = 'http://localhost:3001';
  let savedName: string | null = null;

  try {
    console.log('⏳ Generating test file data (15MB)...');
    const fileSize = 15 * 1024 * 1024; // 15MB
    const testBuffer = Buffer.alloc(fileSize, 'A'); // fill with 'A's

    console.log('⏳ Initializing chunked upload...');
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks (3 chunks total)
    const filename = 'chunk_test_large.txt';

    const initRes = await fetch(`${serverUrl}/api/files/chunk?action=init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `docspace_session=${TEST_SESSION_ID}`
      },
      body: JSON.stringify({
        filename,
        totalSize: fileSize,
        chunkSize,
        mimeType: 'text/plain',
        type: 'upload'
      })
    });

    if (!initRes.ok) {
      throw new Error(`Init failed: ${await initRes.text()}`);
    }

    const { uploadId, totalChunks } = await initRes.json();
    console.log(`✅ Chunked upload initialized: uploadId=${uploadId}, totalChunks=${totalChunks}`);

    // Upload each chunk
    for (let i = 0; i < totalChunks; i++) {
      console.log(`⏳ Uploading chunk ${i + 1}/${totalChunks}...`);
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, fileSize);
      const chunkData = testBuffer.subarray(start, end);

      const uploadRes = await fetch(
        `${serverUrl}/api/files/chunk?action=upload&uploadId=${uploadId}&chunkIndex=${i}`,
        {
          method: 'POST',
          headers: {
            'Cookie': `docspace_session=${TEST_SESSION_ID}`,
            'Content-Type': 'application/octet-stream'
          },
          body: chunkData
        }
      );

      if (!uploadRes.ok) {
        throw new Error(`Chunk ${i} upload failed: ${await uploadRes.text()}`);
      }
      console.log(`✅ Chunk ${i + 1} uploaded successfully.`);
    }

    console.log('⏳ Completing chunked upload...');
    const completeRes = await fetch(`${serverUrl}/api/files/chunk?action=complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `docspace_session=${TEST_SESSION_ID}`
      },
      body: JSON.stringify({ uploadId })
    });

    if (!completeRes.ok) {
      throw new Error(`Complete failed: ${await completeRes.text()}`);
    }

    const result = await completeRes.json();
    savedName = result.savedName;
    console.log('✅ Chunked upload completed successfully!', result);

    // Verify uploaded file contents
    const uploadedFilePath = path.join(STORAGE_ROOT, 'uploads', savedName!);
    const uploadedStat = await fs.stat(uploadedFilePath);
    if (uploadedStat.size !== fileSize) {
      throw new Error(`Size mismatch: expected ${fileSize}, got ${uploadedStat.size}`);
    }

    const uploadedBuffer = await fs.readFile(uploadedFilePath);
    if (!uploadedBuffer.equals(testBuffer)) {
      throw new Error('File contents mismatch!');
    }

    console.log('🎉 ALL CHUNKED UPLOAD INTEGRATION TESTS PASSED!');
  } catch (err: any) {
    console.error('❌ TEST FAILED:', err.message);
  } finally {
    await cleanupTestData(savedName);
  }
}

runTest();
