import { Module } from '@nestjs/common';
import { AiConfigModule } from '../ai-config/ai-config.module.js';
import { McpModule } from '../mcp/mcp.module.js';
import { AiChatController } from './ai-chat.controller.js';
import { AiChatService } from './ai-chat.service.js';

@Module({
  imports: [AiConfigModule, McpModule],
  controllers: [AiChatController],
  providers: [AiChatService],
  exports: [AiChatService],
})
export class AiChatModule {}
