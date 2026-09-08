import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/authenticated-user.interface.js';
import { UiActionsService } from './ui-actions.service.js';
import type { UiActionStatus } from './ui-actions.service.js';

interface ResolveDto {
  status?: UiActionStatus;
  message?: string;
}

@Controller('ui/actions')
export class UiActionsController {
  constructor(private readonly uiActionsService: UiActionsService) {}

  @Get('pending')
  async listPending(@CurrentUser() user?: AuthenticatedUser) {
    const actions = await this.uiActionsService.listPending(user?.id ?? 0);
    return { actions };
  }

  @Post(':id/resolve')
  @HttpCode(200)
  async resolve(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveDto,
  ) {
    const action = await this.uiActionsService.resolve(
      user?.id ?? 0,
      id,
      dto.status ?? 'done',
      dto.message,
    );
    return { action };
  }
}
