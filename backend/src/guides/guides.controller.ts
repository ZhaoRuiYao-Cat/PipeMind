import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/authenticated-user.interface.js';
import { GuidesService } from './guides.service.js';

@Controller('guides')
export class GuidesController {
  constructor(private readonly guidesService: GuidesService) {}

  @Get('pending')
  async listPending(@CurrentUser() user?: AuthenticatedUser) {
    const guides = await this.guidesService.listPending(user?.id ?? 0);
    return { guides };
  }

  @Post(':id/complete')
  @HttpCode(200)
  async complete(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const guide = await this.guidesService.complete(user?.id ?? 0, id);
    return { guide };
  }
}
