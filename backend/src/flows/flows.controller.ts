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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/authenticated-user.interface.js';
import { REFRESH_TOKEN_COOKIE } from '../auth/auth.service.js';
import { FlowsService } from './flows.service.js';
import type { FlowView } from './flows.service.js';
import { SaveFlowDto } from './dto/save-flow.dto.js';
import { RunFlowDto } from './dto/run-flow.dto.js';
import { McpService } from '../mcp/mcp.service.js';

@Controller('flows')
export class FlowsController {
  constructor(
    private readonly flowsService: FlowsService,
    private readonly mcpService: McpService,
  ) {}

  @Get()
  async list(@CurrentUser() user?: AuthenticatedUser) {
    const flows = await this.flowsService.list(user?.id ?? 0);
    return { flows };
  }

  @Get('tools')
  async tools() {
    const status = this.mcpService.getStatus();
    return { tools: status.groups };
  }

  @Post('run')
  @HttpCode(200)
  async runDraft(
    @Req() request: Request,
    @CurrentUser() user?: AuthenticatedUser,
    @Body() dto?: RunFlowDto,
  ) {
    const refreshToken = this.readRefreshToken(request);
    const result = await this.flowsService.run(
      user?.id ?? 0,
      refreshToken,
      dto?.nodes ?? {},
      dto?.edges ?? {},
    );
    return result;
  }

  @Post()
  @HttpCode(201)
  async create(@CurrentUser() user?: AuthenticatedUser, @Body() dto?: SaveFlowDto) {
    const flow: FlowView = await this.flowsService.create(
      user?.id ?? 0,
      dto?.name ?? '',
      dto?.description ?? '',
      dto?.nodes ?? {},
      dto?.edges ?? {},
    );
    return { flow };
  }

  @Get(':id')
  async get(
    @CurrentUser() user?: AuthenticatedUser,
    @Param('id', ParseIntPipe) id?: number,
  ) {
    const flow = await this.flowsService.get(user?.id ?? 0, id ?? 0);
    return { flow };
  }

  @Patch(':id')
  @HttpCode(200)
  async update(
    @CurrentUser() user?: AuthenticatedUser,
    @Param('id', ParseIntPipe) id?: number,
    @Body() dto?: SaveFlowDto,
  ) {
    const flow = await this.flowsService.update(
      user?.id ?? 0,
      id ?? 0,
      dto?.name ?? '',
      dto?.description ?? '',
      dto?.nodes ?? {},
      dto?.edges ?? {},
    );
    return { flow };
  }

  @Post(':id/run')
  @HttpCode(200)
  async runSaved(
    @Req() request: Request,
    @CurrentUser() user?: AuthenticatedUser,
    @Param('id', ParseIntPipe) id?: number,
  ) {
    const refreshToken = this.readRefreshToken(request);
    const flow = await this.flowsService.get(user?.id ?? 0, id ?? 0);
    const result = await this.flowsService.run(
      user?.id ?? 0,
      refreshToken,
      flow.nodes,
      flow.edges,
    );
    return { flowId: flow.id, ...result };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user?: AuthenticatedUser,
    @Param('id', ParseIntPipe) id?: number,
  ) {
    const result = await this.flowsService.remove(user?.id ?? 0, id ?? 0);
    return result;
  }

  private readRefreshToken(request: Request): string {
    const value = request.cookies?.[REFRESH_TOKEN_COOKIE];
    return typeof value === 'string' ? value : '';
  }
}
