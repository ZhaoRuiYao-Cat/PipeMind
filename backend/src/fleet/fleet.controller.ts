// 设备 / 基站 / 巡航路线 控制器（REST API，全部 @Public 供外部调用/文档可看）
import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator.js";
import { FleetService, type TelemetryPoint } from "./fleet.service.js";
import { FleetGateway } from "./fleet.gateway.js";
import type { Device, BaseStation } from "./entities/fleet.entities.js";

@Controller("devices")
@Public()
export class DevicesController {
  constructor(
    private readonly fleet: FleetService,
    private readonly gateway: FleetGateway,
  ) {}

  @Get()
  list(): Promise<Device[]> {
    return this.fleet.listDevices();
  }

  @Get("telemetry/latest")
  telemetryLatest() {
    return { devices: this.fleet.latestTelemetry() };
  }

  @Post()
  create(@Body() body: Partial<Device>) {
    return this.fleet.createDevice(body ?? {});
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.fleet.getDevice(id);
  }

  @Patch(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: Partial<Device>) {
    return this.fleet.updateDevice(id, body ?? {});
  }

  @Delete(":id")
  @HttpCode(200)
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.fleet.removeDevice(id);
    return { ok: true };
  }

  // 巡航路线（基于当前 GIS 数据源规划的经纬度点列）
  @Get(":id/route")
  route(@Param("id", ParseIntPipe) id: number) {
    return this.fleet.getRoute(id);
  }

  @Put(":id/route")
  @HttpCode(200)
  saveRoute(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      source?: { kind: string; id: number; name: string };
      points: Array<{ lon: number; lat: number }>;
    },
  ) {
    return this.fleet.saveRoute(id, body ?? { points: [] });
  }

  // 真实遥测推送：外部设备/探伤终端 POST 后由 Socket 实时广播到前端
  @Post(":id/telemetry")
  @HttpCode(200)
  telemetry(@Param("id", ParseIntPipe) id: number, @Body() body: Partial<TelemetryPoint>) {
    const point = this.fleet.pushTelemetry({
      deviceId: id,
      lon: Number(body?.lon ?? 0),
      lat: Number(body?.lat ?? 0),
      heading: body?.heading,
      speed: body?.speed,
      battery: body?.battery,
      status: body?.status,
      ts: body?.ts,
    });
    this.gateway.broadcastTelemetry(point);
    return point;
  }
}

@Controller("base-stations")
@Public()
export class BaseStationsController {
  constructor(private readonly fleet: FleetService) {}

  @Get()
  list(): Promise<BaseStation[]> {
    return this.fleet.listStations();
  }

  @Post()
  create(@Body() body: Partial<BaseStation>) {
    return this.fleet.createStation(body ?? {});
  }

  @Patch(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: Partial<BaseStation>) {
    return this.fleet.updateStation(id, body ?? {});
  }

  @Delete(":id")
  @HttpCode(200)
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.fleet.removeStation(id);
    return { ok: true };
  }
}
