import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/authenticated-user.interface.js';
import { DataFilesService } from './data-files.service.js';
import type { DataFileView } from './data-files.service.js';
import { SetSharedDto } from './dto/set-shared.dto.js';

@Controller('data-files')
export class DataFilesController {
  constructor(private readonly dataFilesService: DataFilesService) {}

  @Get()
  async listMine(@CurrentUser() user?: AuthenticatedUser) {
    const files = await this.dataFilesService.listMine(user?.id ?? 0);
    return { files };
  }

  @Get('shared')
  async listShared(@CurrentUser() user?: AuthenticatedUser) {
    const files = await this.dataFilesService.listShared(user?.id ?? 0);
    return { files };
  }

  @Post('upload')
  @HttpCode(201)
  async upload(
    @CurrentUser() user?: AuthenticatedUser,
    @Req() request?: Request,
    @Query('name') name?: string,
    @Query('mime') mime?: string,
    @Query('shared') shared?: string,
  ) {
    const isShared = shared === 'true' || shared === '1';
    const file: DataFileView = await this.dataFilesService.upload(
      user?.id ?? 0,
      request as Request,
      name,
      mime,
      isShared,
    );
    return { file };
  }

  @Patch(':id/shared')
  @HttpCode(200)
  async setShared(
    @CurrentUser() user?: AuthenticatedUser,
    @Param('id', ParseIntPipe) id?: number,
    @Body() dto?: SetSharedDto,
  ) {
    const file: DataFileView = await this.dataFilesService.setShared(
      user?.id ?? 0,
      id ?? 0,
      dto?.shared ?? false,
    );
    return { file };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user?: AuthenticatedUser,
    @Param('id', ParseIntPipe) id?: number,
  ) {
    const result = await this.dataFilesService.remove(user?.id ?? 0, id ?? 0);
    return result;
  }

  @Get(':id/content')
  async content(
    @CurrentUser() user?: AuthenticatedUser,
    @Param('id', ParseIntPipe) id?: number,
    @Res() response?: Response,
  ) {
    const accessible = await this.dataFilesService.findAccessible(
      user?.id ?? 0,
      id ?? 0,
    );
    await this.dataFilesService.streamContent(
      response as Response,
      accessible.row,
    );
  }
}
