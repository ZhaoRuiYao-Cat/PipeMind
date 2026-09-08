import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataFilesController } from './data-files.controller.js';
import { DataFilesService } from './data-files.service.js';
import { DataFile } from './entities/data-file.entity.js';
import { User } from '../auth/entities/user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([DataFile, User])],
  controllers: [DataFilesController],
  providers: [DataFilesService],
  exports: [DataFilesService],
})
export class DataFilesModule {}
