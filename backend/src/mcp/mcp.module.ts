import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UserSettingsModule } from '../user-settings/user-settings.module.js';
import { AiConfigModule } from '../ai-config/ai-config.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { GuidesModule } from '../guides/guides.module.js';
import { UiActionsModule } from '../ui-actions/ui-actions.module.js';
import { DataFilesModule } from '../data-files/data-files.module.js';
import { McpController } from './mcp.controller.js';
import { McpService } from './mcp.service.js';

@Module({
  imports: [
    NotificationsModule,
    UserSettingsModule,
    AiConfigModule,
    AuthModule,
    GuidesModule,
    UiActionsModule,
    DataFilesModule,
  ],
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
