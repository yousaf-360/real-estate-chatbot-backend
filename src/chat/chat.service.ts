import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class ChatService {
  private openai: OpenAI;
  private supabase: any;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });

    this.supabase = createClient(
      this.configService.get('SUPABASE_URL'),
      this.configService.get('SUPABASE_KEY')
    );
  }

  async createChat() {
    const { data, error } = await this.supabase
      .from('chats')
      .insert([{ created_at: new Date().toISOString() }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getAllChats() {
    const { data, error } = await this.supabase
      .from('chats')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getChatMessages(chatId: string) {
    const { data, error } = await this.supabase
      .from('messages')
      .select('id,content,role,created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }
  async streamChatResponse(chatId: string, userMessage: string) {
    try {
      // Store user message
      await this.storeMessage({
        chat_id: chatId,
        content: userMessage,
        role: 'user',
      });

      // Get previous messages for context
      const { data: previousMessages } = await this.supabase
        .from('messages')
        .select('content, role')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
        .limit(10);

      const messages = previousMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
      console.log(messages);

      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a knowledgeable real estate assistant. Resolve user queries related to real estate. Help the users with buy, sell, purchase and rent of properties.',
          },
          ...messages,
          { role: 'user', content: userMessage },
        ],
        stream: true,
      });

      return stream;
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }

  async storeMessage({ chat_id, content, role }) {
    const { error } = await this.supabase
      .from('messages')
      .insert([
        {
          chat_id,
          content,
          role,
          created_at: new Date().toISOString(),
        },
      ]);

    if (error) throw error;
  }
}
