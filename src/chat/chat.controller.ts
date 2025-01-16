import { Controller, Get, Post, Param, Sse, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async createChat() {
    return await this.chatService.createChat();
  }

  @Get()
  async getAllChats() {
    return await this.chatService.getAllChats();
  }

  @Get(':id/messages')
  async getChatMessages(@Param('id') chatId: string) {
    return await this.chatService.getChatMessages(chatId);
  }

  @Sse('stream')
  async streamChat(
    @Query('message') message: string,
    @Query('chatId') chatId: string,
  ): Promise<Observable<MessageEvent>> {
    return new Observable((subscriber) => {
      const stream = this.chatService.streamChatResponse(chatId, message);
      let fullResponse = '';

      stream.then(async (response) => {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            subscriber.next({ 
              data: { 
                content,
                type: 'chunk'
              },
              type: 'message',
              id: String(Date.now()),
            } as unknown as MessageEvent);
          }
        }
        
        // Send complete response
        subscriber.next({ 
          data: { 
            content: fullResponse,
            type: 'complete'
          },
          type: 'message',
          id: String(Date.now()),
        } as unknown as MessageEvent);

        // Store the complete assistant response
        await this.chatService.storeMessage({
          chat_id: chatId,
          content: fullResponse,
          role: 'assistant',
        });

        subscriber.complete();
      }).catch((error) => {
        subscriber.error(error);
      });
    });
  }
}
