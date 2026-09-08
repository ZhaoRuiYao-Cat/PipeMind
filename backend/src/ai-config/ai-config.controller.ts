import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { AiConfigService } from './ai-config.service.js';
import { SaveAiProvidersDto } from './dto/save-ai-providers.dto.js';
import { TestAiProviderDto } from './dto/test-ai-provider.dto.js';

@Controller('ai/providers')
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get()
  async list() {
    const providers = await this.aiConfigService.list();
    return { providers };
  }

  @Put()
  @HttpCode(200)
  async save(@Body() dto: SaveAiProvidersDto) {
    const providers = await this.aiConfigService.save(dto.providers);
    return { providers };
  }

  @Post('test')
  @HttpCode(200)
  async test(@Body() dto: TestAiProviderDto) {
    const result = await this.aiConfigService.test(dto);
    return result;
  }
}
