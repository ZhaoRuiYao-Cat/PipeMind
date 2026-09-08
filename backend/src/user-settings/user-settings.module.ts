import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSettingsController } from './user-settings.controller.js';
import { UserSettingsService } from './user-settings.service.js';
import { UserSetting } from './entities/user-setting.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserSetting])],
  controllers: [UserSettingsController],
  providers: [UserSettingsService],
  exports: [UserSettingsService],
})
export class UserSettingsModule {}
