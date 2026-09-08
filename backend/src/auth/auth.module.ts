import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UserSettingsModule } from '../user-settings/user-settings.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RsaService } from './rsa.service.js';
import { User } from './entities/user.entity.js';
import { UserSecret } from './entities/user-secret.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSecret, RefreshToken]),
    NotificationsModule,
    UserSettingsModule,
  ],
  controllers: [AuthController],
  providers: [
    RsaService,
    AuthService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
