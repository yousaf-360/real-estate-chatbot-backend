import { Controller, Get, Post, Param, Sse, Query,Body,Res } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';

type CustomMessageEvent = {
  data: { type: string; content?: any; fullMessage?: string; chatId?: string };
  type: string;
  lastEventId: string;
  origin: string;
};

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('create')
  async createChat() {
    const chatId = await this.chatService.createChat();
    return { chatId };
  }

  @Get()
  async getAllChats() {
    return await this.chatService.getAllChats();
  }

  @Get(':id/messages')
  async getChatMessages(@Param('id') chatId: string) {
    return await this.chatService.getChatMessages(chatId);
  }

  @Post(':chatId/message')
  @Sse()
  async streamChat(
    @Param('chatId') chatId: string,
    @Body() body: { message: string },
    @Res() response: Response
  ): Promise<Observable<CustomMessageEvent>> {
    console.log(`Chat ID: ${chatId}, Message: ${body.message}`);
    let fullMessage = '';
    
    const stream = await this.chatService.streamChatResponse(body.message, chatId);

    return from(stream).pipe(
      map((chunk): CustomMessageEvent => {
        console.log('Chunk:', chunk.choices[0].delta);
        
        if (chunk.choices[0].delta.content) {
          fullMessage += chunk.choices[0].delta.content;
        }
        
        if (!chunk.choices[0].delta.content && !chunk.choices[0].delta.tool_calls) {
          console.log('Full message:', fullMessage);
          this.chatService.storeMessage({
            chat_id: chatId,
            content: fullMessage,
            role: 'assistant'
          });
        }

        return {
          data: {
            type: chunk.choices[0].delta.tool_calls ? 'tool_calls' : 
                  chunk.choices[0].delta.content ? 'content' : 'done',
            content: chunk.choices[0].delta.tool_calls || chunk.choices[0].delta.content,
            fullMessage: !chunk.choices[0].delta.content && !chunk.choices[0].delta.tool_calls ? fullMessage : undefined
          },
          type: 'message',
          lastEventId: '',
          origin: ''
        };
      })
    );
  }

  @Post('tool-response')
  async handleToolResponse(
    @Body() body: { toolCalls: any[] }
  ) {
    return this.chatService.handleToolCalls(body.toolCalls);
  }
}
