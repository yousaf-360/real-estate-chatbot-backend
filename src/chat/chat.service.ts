import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface PropertySearchParams {
  propertyType: string;
  budget: number;
  location: string;
  purpose: 'buy' | 'rent';
}

@Injectable()
export class ChatService {
  private openai: OpenAI;
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
    
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_KEY')
    );
  }

  async createChat() {
    const { data: chat, error } = await this.supabase
      .from('chats')
      .insert([{ created_at: new Date().toISOString() }])
      .select()
      .single();

    if (error) throw error;
    return chat.id;
  }

  async streamChatResponse(message: string, chatId: string) {
    try {
      await this.storeMessage({
        chat_id: chatId,
        content: message,
        role: 'user',
      });

      const { data: previousMessages } = await this.supabase
        .from('messages')
        .select('content, role, tool_calls')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      console.log('Chat history:', previousMessages);

      const messages = previousMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls })
      }));

      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [{
        type: "function",
        function: {
          name: "search_properties",
          description: "Search for properties in Japan based on user requirements",
          parameters: {
            type: "object",
            properties: {
              propertyType: {
                type: "string",
                description: "Type of property (apartment, house, mansion, etc.)"
              },
              budget: {
                type: "number",
                description: "Maximum budget in Japanese Yen"
              },
              location: {
                type: "string",
                description: "Preferred location or city in Japan"
              },
              purpose: {
                type: "string",
                enum: ["buy", "rent"],
                description: "Whether the user wants to buy or rent"
              }
            },
            required: ["propertyType", "budget", "location", "purpose"],
            additionalProperties: false
          },
          strict: true
        }
      }];

      const stream = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a Japanese real estate assistant. Help users find properties in Japan by:
              1. Gathering required information about their property needs
              2. Using the search_properties function once you have all required details
              3. Presenting the results in a clear, organized way
              
              If user's message doesn't contain all required information, ask for missing details politely.
              Required information: property type, budget (in JPY), location, and whether they want to buy or rent.
              
              For budget, help users understand typical ranges:
              - Rental apartments: ¥50,000 - ¥300,000/month
              - Purchase apartments: ¥20,000,000 - ¥100,000,000
              - Houses: ¥30,000,000 - ¥200,000,000`
          },
          ...messages
        ],
        tools,
        tool_choice: "auto",
        stream: true,
      });

      return stream;
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }

  async storeMessage({ chat_id, content, role, tool_calls = null }) {
    const { error } = await this.supabase
      .from('messages')
      .insert([
        {
          chat_id,
          content,
          role,
          tool_calls,
          created_at: new Date().toISOString(),
        },
      ]);

    if (error) throw error;
  }

  async handleToolCalls(toolCalls: any[]) {
    const results = [];
    
    for (const toolCall of toolCalls) {
      if (toolCall.function.name === 'search_properties') {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await this.searchProperties(args);
        results.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
      }
    }
    
    return results;
  }

  private async searchProperties(params: PropertySearchParams) {
    console.log('Mock search with params:', params);
    
    return {
      success: true,
      message: "Sample property listings for your criteria:",
      properties: [
        {
          id: 1,
          title: `Modern ${params.propertyType} in ${params.location}`,
          price: params.purpose === 'rent' ? '¥150,000/month' : '¥45,000,000',
          details: "2LDK • 65m² • Built in 2020",
          features: ["Modern appliances", "Security system", "Balcony"],
          location: `${params.location} - 5 min to station`,
          availability: "Immediate"
        },
        {
          id: 2,
          title: `Spacious ${params.propertyType} near park`,
          price: params.purpose === 'rent' ? '¥180,000/month' : '¥52,000,000',
          details: "3LDK • 80m² • Built in 2019",
          features: ["Pet friendly", "Built-in storage", "Parking"],
          location: `${params.location} - Near central park`,
          availability: "From next month"
        }
      ]
    };
  }

  async getChatMessages(chatId: string) {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

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
}
