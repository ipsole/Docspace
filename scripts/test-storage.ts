import { 
  createUser, 
  readUser, 
  appendMessage, 
  loadMessages, 
  User, 
  Message 
} from '../src/lib/storage/storage';
import { logInfo, readLogs } from '../src/lib/storage/logger';
import { createBackup, listBackups } from '../src/lib/storage/backup';
import fs from 'fs/promises';
import path from 'path';

async function runTests() {
  console.log('🧪 RUNNING LOCAL FILE STORAGE LAYER TESTS...\n');

  try {
    // Test 1: User creation and read
    console.log('⏳ Test 1: Creating and reading user...');
    const testUser: User = {
      id: 'test-user-123',
      username: 'test_user',
      displayName: 'Test User',
      email: 'test@example.com',
      passwordHash: 'dummyhash',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      avatar: null,
      lastSeen: new Date().toISOString(),
      status: 'online',
      preferences: {},
      theme: 'dark',
      role: 'user',
      bio: 'Just a test user'
    };

    await createUser(testUser);
    const read = await readUser('test-user-123');
    if (read && read.username === 'test_user') {
      console.log('✅ Test 1 Passed: User created and read successfully!');
    } else {
      throw new Error('User read mismatch');
    }

    // Test 2: File Locking & Concurrent writes
    console.log('\n⏳ Test 2: Simulating concurrent writes to messages (file locking verification)...');
    const chatId = 'test-chat-concurrency';
    
    // Fire off multiple concurrent appends to see if queue handles it without JSON corruption
    const appendPromises = Array.from({ length: 15 }).map((_, idx) => {
      const msg: Message = {
        id: `msg-${idx}`,
        chatId,
        senderId: 'test-user-123',
        content: `Concurrent Message ${idx}`,
        type: 'text',
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        attachments: [],
        replyTo: null,
        reactions: []
      };
      return appendMessage(chatId, msg);
    });

    await Promise.all(appendPromises);
    const loadedMsgs = await loadMessages(chatId);
    console.log(`ℹ️ Total messages loaded after concurrent appends: ${loadedMsgs.length}`);
    
    if (loadedMsgs.length === 15) {
      console.log('✅ Test 2 Passed: File-locking queue prevented write overlaps successfully!');
    } else {
      throw new Error(`Concurrency mismatch: Expected 15 messages, got ${loadedMsgs.length}`);
    }

    // Test 3: Logs Serialization
    console.log('\n⏳ Test 3: Testing structured JSONL logging...');
    await logInfo('SYSTEM', 'Storage self-test completed successfully', { status: 'OK' });
    const logData = await readLogs({ limit: 5 });
    
    if (logData.total > 0 && logData.logs[0].message === 'Storage self-test completed successfully') {
      console.log('✅ Test 3 Passed: Structured log appended and searched successfully!');
    } else {
      throw new Error('Log verification mismatch');
    }

    // Test 4: Backups Integration
    console.log('\n⏳ Test 4: Generating and verifying backup package...');
    const filename = await createBackup();
    const backupsList = await listBackups();
    const found = backupsList.some(b => b.filename === filename);
    
    if (found) {
      console.log(`✅ Test 4 Passed: Backup created successfully: ${filename}!`);
    } else {
      throw new Error('Backup file not found in lists');
    }

    // Clean up test data
    console.log('\n⏳ Cleaning up temporary test files...');
    const storageRoot = path.join(process.cwd(), 'storage');
    await fs.unlink(path.join(storageRoot, 'users', 'test-user-123.json')).catch(() => {});
    await fs.unlink(path.join(storageRoot, 'conversations', 'test-chat-concurrency.json')).catch(() => {});
    await fs.unlink(path.join(storageRoot, 'messages', 'test-chat-concurrency.json')).catch(() => {});
    await fs.unlink(path.join(storageRoot, 'backups', filename)).catch(() => {});
    
    console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

runTests();
