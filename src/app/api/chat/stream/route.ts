import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { chatEmitter } from '@/lib/storage/eventEmitter';
import { updateUser, listUsers } from '@/lib/storage/storage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const encoder = new TextEncoder();
    let keepAliveInterval: NodeJS.Timeout;

    const stream = new ReadableStream({
      async start(controller) {
        // Mark user as online and broadcast presence
        await updateUser(user.id, { status: 'online', lastSeen: new Date().toISOString() });
        broadcastPresence(user.id, 'online');

        // Helper to send events
        const sendEvent = (type: string, data: any) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch (e) {
            // Controller might be closed
          }
        };

        // Send initial connection event
        sendEvent('connected', { userId: user.id });

        // Event handlers
        const onMessageSent = ({ message, participants }: { message: any; participants: string[] }) => {
          if (participants.includes(user.id)) {
            sendEvent('message', message);
          }
        };

        const onMessageUpdated = ({ message, participants }: { message: any; participants: string[] }) => {
          if (participants.includes(user.id)) {
            sendEvent('message_updated', message);
          }
        };

        const onMessageDeleted = ({ messageId, chatId, participants }: { messageId: string; chatId: string; participants: string[] }) => {
          if (participants.includes(user.id)) {
            sendEvent('message_deleted', { messageId, chatId });
          }
        };

        const onChatCreated = (convo: any) => {
          if (convo.participants.includes(user.id)) {
            sendEvent('chat_created', convo);
          }
        };

        const onChatUpdated = (convo: any) => {
          if (convo.participants.includes(user.id)) {
            sendEvent('chat_updated', convo);
          }
        };

        const onChatDeleted = ({ chatId, participants }: { chatId: string; participants: string[] }) => {
          if (participants.includes(user.id)) {
            sendEvent('chat_deleted', { chatId });
          }
        };

        const onTyping = ({ chatId, userId, username, isTyping, participants }: any) => {
          if (participants.includes(user.id) && userId !== user.id) {
            sendEvent('typing', { chatId, userId, username, isTyping });
          }
        };

        const onPresence = ({ userId, status, lastSeen }: any) => {
          // Send all presence updates to all connected users
          sendEvent('presence', { userId, status, lastSeen });
        };

        // Attach listeners
        chatEmitter.on('message_sent', onMessageSent);
        chatEmitter.on('message_updated', onMessageUpdated);
        chatEmitter.on('message_deleted', onMessageDeleted);
        chatEmitter.on('chat_created', onChatCreated);
        chatEmitter.on('chat_updated', onChatUpdated);
        chatEmitter.on('chat_deleted', onChatDeleted);
        chatEmitter.on('typing', onTyping);
        chatEmitter.on('presence', onPresence);

        // Periodically send ping heartbeats to keep the connection open
        keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': ping\n\n'));
          } catch {
            // Fail silently
          }
        }, 15000);

        // Handle disconnect/close cleanups
        request.signal.addEventListener('abort', async () => {
          clearInterval(keepAliveInterval);
          chatEmitter.off('message_sent', onMessageSent);
          chatEmitter.off('message_updated', onMessageUpdated);
          chatEmitter.off('message_deleted', onMessageDeleted);
          chatEmitter.off('chat_created', onChatCreated);
          chatEmitter.off('chat_updated', onChatUpdated);
          chatEmitter.off('chat_deleted', onChatDeleted);
          chatEmitter.off('typing', onTyping);
          chatEmitter.off('presence', onPresence);

          try {
            controller.close();
          } catch {
            // Fail silently
          }

          // Mark user as offline
          await updateUser(user.id, { status: 'offline', lastSeen: new Date().toISOString() });
          broadcastPresence(user.id, 'offline');
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    return new Response('Internal Server Error', { status: 500 });
  }
}

// Helper to broadcast presence updates
function broadcastPresence(userId: string, status: 'online' | 'offline') {
  chatEmitter.emit('presence', {
    userId,
    status,
    lastSeen: new Date().toISOString()
  });
}
