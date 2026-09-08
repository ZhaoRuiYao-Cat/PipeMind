import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/authenticated-user.interface.js';
import { UpsertSettingsDto } from './dto/upsert-settings.dto.js';
import { UserSettingsService } from './user-settings.service.js';

@Controller('settings')
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @Get()
  async get(@CurrentUser() user?: AuthenticatedUser) {
    const settings = await this.userSettingsService.getAll(user?.id ?? 0);
    return { settings };
  }

  @Put()
  @HttpCode(200)
  async upsert(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpsertSettingsDto,
  ) {
    const settings = await this.userSettingsService.upsertAll(
      user?.id ?? 0,
      dto.values,
    );
    return { settings };
  }
}
