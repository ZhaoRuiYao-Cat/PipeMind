import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';
import { AuthModule } from './auth/auth.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { UserSettingsModule } from './user-settings/user-settings.module.js';
import { AiConfigModule } from './ai-config/ai-config.module.js';
import { GuidesModule } from './guides/guides.module.js';
import { UiActionsModule } from './ui-actions/ui-actions.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { AiChatModule } from './ai-chat/ai-chat.module.js';
import { User } from './auth/entities/user.entity.js';
import { UserSecret } from './auth/entities/user-secret.entity.js';
import { RefreshToken } from './auth/entities/refresh-token.entity.js';
import { Notification } from './notifications/entities/notification.entity.js';
import { UserSetting } from './user-settings/entities/user-setting.entity.js';
import { AiProvider } from './ai-config/entities/ai-provider.entity.js';
import { GuideTask } from './guides/entities/guide-task.entity.js';
import { UiAction } from './ui-actions/entities/ui-action.entity.js';
import { DataFile } from './data-files/entities/data-file.entity.js';
import { DataFilesModule } from './data-files/data-files.module.js';
import { Flow } from './flows/entities/flow.entity.js';
import { FlowsModule } from './flows/flows.module.js';
import { Device, DeviceRoute, BaseStation } from './fleet/entities/fleet.entities.js';
import { FleetModule } from './fleet/fleet.module.js';
import { CatalogModule } from './catalog/catalog.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): DataSourceOptions => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: Number(config.get<string>('DB_PORT', '3306')),
        username: config.get<string>('DB_USER', 'root'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_NAME', 'pipemind'),
        charset: 'utf8mb4',
        timezone: '+08:00',
        entities: [
          User,
          UserSecret,
          RefreshToken,
          Notification,
          UserSetting,
          AiProvider,
          GuideTask,
          UiAction,
          DataFile,
          Flow,
          Device,
          DeviceRoute,
          BaseStation,
        ],
        synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
      }),
    }),
    AuthModule,
    NotificationsModule,
    UserSettingsModule,
    AiConfigModule,
    GuidesModule,
    UiActionsModule,
    McpModule,
    AiChatModule,
    DataFilesModule,
    FlowsModule,
    FleetModule,
    CatalogModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
