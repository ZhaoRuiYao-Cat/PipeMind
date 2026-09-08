import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flow } from './entities/flow.entity.js';
import { FlowsController } from './flows.controller.js';
import { FlowsService } from './flows.service.js';
import { McpModule } from '../mcp/mcp.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Flow]), McpModule],
  controllers: [FlowsController],
  providers: [FlowsService],
  exports: [FlowsService],
})
export class FlowsModule {}
