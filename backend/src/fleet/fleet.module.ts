import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Device, DeviceRoute, BaseStation } from "./entities/fleet.entities.js";
import { FleetService } from "./fleet.service.js";
import { DevicesController, BaseStationsController } from "./fleet.controller.js";
import { FleetGateway } from "./fleet.gateway.js";

@Module({
  imports: [TypeOrmModule.forFeature([Device, DeviceRoute, BaseStation])],
  controllers: [DevicesController, BaseStationsController],
  providers: [FleetService, FleetGateway],
  exports: [FleetService, FleetGateway],
})
export class FleetModule {}
