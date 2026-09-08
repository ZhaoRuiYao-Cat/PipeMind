import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuidesController } from './guides.controller.js';
import { GuidesService } from './guides.service.js';
import { GuideTask } from './entities/guide-task.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([GuideTask])],
  controllers: [GuidesController],
  providers: [GuidesService],
  exports: [GuidesService],
})
export class GuidesModule {}
