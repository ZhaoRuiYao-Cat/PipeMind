import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UiActionsController } from './ui-actions.controller.js';
import { UiActionsService } from './ui-actions.service.js';
import { UiAction } from './entities/ui-action.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([UiAction])],
  controllers: [UiActionsController],
  providers: [UiActionsService],
  exports: [UiActionsService],
})
export class UiActionsModule {}
