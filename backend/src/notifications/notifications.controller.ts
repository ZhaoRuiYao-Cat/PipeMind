import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/authenticated-user.interface.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user?: AuthenticatedUser) {
    return this.notificationsService.listForUser(user?.id ?? 0);
  }

  @Patch(':id/read')
  @HttpCode(200)
  async markRead(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notificationsService.markRead(user?.id ?? 0, id);
    return { success: true };
  }

  @Patch('read-all')
  @HttpCode(200)
  async markAllRead(@CurrentUser() user: AuthenticatedUser | undefined) {
    await this.notificationsService.markAllRead(user?.id ?? 0);
    return { success: true };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notificationsService.remove(user?.id ?? 0, id);
    return { success: true };
  }
}
