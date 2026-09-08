import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConfigController } from './ai-config.controller.js';
import { AiConfigService } from './ai-config.service.js';
import { AiSecretService } from './ai-secret.service.js';
import { AiProvider } from './entities/ai-provider.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AiProvider])],
  controllers: [AiConfigController],
  providers: [AiConfigService, AiSecretService],
  exports: [AiConfigService],
})
export class AiConfigModule {}
