import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
const TEST_USER_ID = 'test-user-folder-id';
const TEST_SESSION_ID = 'test-session-folder-id';

async function setupTestData() {
  console.log('⏳ Setting up test user and session...');
  
  const testUser = {
    id: TEST_USER_ID,
    username: 'test_folder_user',
    displayName: 'Test Folder User',
    email: 'folder@example.com',
    passwordHash: 'dummy',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    avatar: null,
    status: 'online',
    role: 'user',
    bio: 'Test user for folder uploads'
  };

  const testSession = {
    id: TEST_SESSION_ID,
    userId: TEST_USER_ID,
    username: 'test_folder_user',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
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
  
  const serverUrl = 'http://localhost:3000';
  let savedName: string | null = null;

  try {
    console.log('⏳ Generating test folder data...');
    const filesToUpload = [
      { relativePath: 'file1.txt', content: 'Content of File 1' },
      { relativePath: 'sub/file2.txt', content: 'Content of File 2 in subfolder' },
      { relativePath: 'sub/nested/file3.txt', content: 'Content of File 3 in nested folder' }
    ];

    const folderId = 'test-folder-upload-session';
    const folderName = 'My Test Folder';

    for (const item of filesToUpload) {
      console.log(`\n⏳ Uploading ${item.relativePath}...`);
      const fileBuffer = Buffer.from(item.content);
      const fileSize = fileBuffer.length;
      const chunkSize = 2 * 1024 * 1024; // 2MB chunk

      // Step 1: Init file inside folder
      const initRes = await fetch(`${serverUrl}/api/files/chunk?action=init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `docspace_session=${TEST_SESSION_ID}`
        },
        body: JSON.stringify({
          filename: path.basename(item.relativePath),
          totalSize: fileSize,
          chunkSize,
          mimeType: 'text/plain',
          type: 'upload',
          folderId,
          relativePath: item.relativePath
        })
      });

      if (!initRes.ok) {
        throw new Error(`Init failed for ${item.relativePath}: ${await initRes.text()}`);
      }

      const { uploadId } = await initRes.json();

      // Step 2: Upload chunk (only 1 chunk since size is small)
      const uploadRes = await fetch(
        `${serverUrl}/api/files/chunk?action=upload&uploadId=${uploadId}&chunkIndex=0`,
        {
          method: 'POST',
          headers: {
            'Cookie': `docspace_session=${TEST_SESSION_ID}`,
            'Content-Type': 'application/octet-stream'
          },
          body: fileBuffer
        }
      );

      if (!uploadRes.ok) {
        throw new Error(`Upload failed for ${item.relativePath}: ${await uploadRes.text()}`);
      }

      // Step 3: Complete file upload inside folder
      const completeRes = await fetch(`${serverUrl}/api/files/chunk?action=complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `docspace_session=${TEST_SESSION_ID}`
        },
        body: JSON.stringify({ uploadId })
      });

      if (!completeRes.ok) {
        throw new Error(`Complete failed for ${item.relativePath}: ${await completeRes.text()}`);
      }

      console.log(`✅ File ${item.relativePath} uploaded inside temp folder.`);
    }

    // Step 4: Finalize/Zip the folder on the server
    console.log('\n⏳ Finalizing folder compression on server...');
    const finalizeRes = await fetch(`${serverUrl}/api/files/chunk?action=complete_folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `docspace_session=${TEST_SESSION_ID}`
      },
      body: JSON.stringify({ folderId, folderName })
    });

    if (!finalizeRes.ok) {
      throw new Error(`Finalize folder failed: ${await finalizeRes.text()}`);
    }

    const result = await finalizeRes.json();
    savedName = result.savedName;
    console.log('✅ Server-side folder zipping completed successfully!', result);

    // Step 5: Verify zip contents
    const zipFilePath = path.join(STORAGE_ROOT, 'uploads', savedName!);
    console.log(`⏳ Verifying ZIP file: ${zipFilePath}...`);
    
    const zip = new AdmZip(zipFilePath);
    const zipEntries = zip.getEntries();

    console.log('ℹ️ Files inside generated ZIP:');
    zipEntries.forEach(entry => {
      console.log(` - ${entry.entryName}`);
    });

    for (const item of filesToUpload) {
      const entry = zip.getEntry(item.relativePath);
      if (!entry) {
        throw new Error(`Expected file missing in zip: ${item.relativePath}`);
      }
      const fileText = zip.readAsText(entry);
      if (fileText !== item.content) {
        throw new Error(`Content mismatch for ${item.relativePath}: expected "${item.content}", got "${fileText}"`);
      }
    }

    console.log('\n🎉 ALL SERVER-SIDE FOLDER ZIPPING INTEGRATION TESTS PASSED!');
  } catch (err: any) {
    console.error('\n❌ TEST FAILED:', err.message);
  } finally {
    await cleanupTestData(savedName);
  }
}

runTest();
