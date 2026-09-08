import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/authenticated-user.interface.js';
import { REFRESH_TOKEN_COOKIE } from '../auth/auth.service.js';
import { AiChatService } from './ai-chat.service.js';
import type { ChatMessageDto } from './ai-chat.service.js';

interface ChatRequestDto {
  messages?: ChatMessageDto[];
  model?: string;
}

@Controller('ai/chat')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post()
  @HttpCode(200)
  async chat(
    @Req() request: Request,
    @Body() dto: ChatRequestDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const refreshToken =
      typeof request.cookies?.[REFRESH_TOKEN_COOKIE] === 'string'
        ? (request.cookies[REFRESH_TOKEN_COOKIE] as string)
        : '';
    const result = await this.aiChatService.chat(
      user,
      refreshToken,
      dto.messages ?? [],
      dto.model,
    );
    return result;
  }
}
