import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DefectReport } from "./entities/defect-report.entity.js";
import { DefectsService } from "./defects.service.js";
import { DefectsController } from "./defects.controller.js";
import { FleetModule } from "../fleet/fleet.module.js";

@Module({
  imports: [TypeOrmModule.forFeature([DefectReport]), FleetModule],
  controllers: [DefectsController],
  providers: [DefectsService],
})
export class DefectsModule {}
