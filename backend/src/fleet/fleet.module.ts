import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Device, DeviceRoute, BaseStation } from "./entities/fleet.entities.js";
import { FleetService } from "./fleet.service.js";
import { DevicesController, BaseStationsController } from "./fleet.controller.js";
import { FleetGateway } from "./fleet.gateway.js";
import { DataFilesModule } from "../data-files/data-files.module.js";

@Module({
  imports: [TypeOrmModule.forFeature([Device, DeviceRoute, BaseStation]), DataFilesModule],
  controllers: [DevicesController, BaseStationsController],
  providers: [FleetService, FleetGateway],
  exports: [FleetService, FleetGateway],
})
export class FleetModule {}
