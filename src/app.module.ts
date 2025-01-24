import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { CrawlerModule } from './crawler/crawler.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:true,
      envFilePath:'.env'
    }),
    ChatModule,
    CrawlerModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
