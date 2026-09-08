// 设备 / 基站 / 巡航路线 控制器（REST API，全部 @Public 供外部调用/文档可看）
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator.js";
import { FleetService, type TelemetryPoint } from "./fleet.service.js";
import { FleetGateway } from "./fleet.gateway.js";
import { DataFilesService } from "../data-files/data-files.service.js";
import type { Device, BaseStation } from "./entities/fleet.entities.js";

@Controller("devices")
@Public()
export class DevicesController {
  constructor(
    private readonly fleet: FleetService,
    private readonly gateway: FleetGateway,
    private readonly dataFiles: DataFilesService,
  ) {}

  @Get()
  list() {
    return this.fleet.listDevices();
  }

  @Get("telemetry/latest")
  telemetryLatest() {
    return { devices: this.fleet.latestTelemetry() };
  }

  /**
   * 已注册设备拉取“系统 GIS 数据源”地图：仅需设备 id（query: device）与批准密钥
   * （Header: x-device-key），无需系统账号登录。
   */
  @Get("geo/:fileId")
  async geoData(
    @Param("fileId", ParseIntPipe) fileId: number,
    @Query("device") device?: string,
    @Headers("x-device-key") deviceKey?: string,
  ) {
    const deviceId = Number(device);
    if (!deviceId) throw new BadRequestException("缺少 device 查询参数（设备 id）");
    await this.fleet.authorizeDevice(deviceId, deviceKey);
    const text = await this.dataFiles.readForDevice(fileId);
    return JSON.parse(text);
  }

  /**
   * 设备入网第一步：设备端提交注册申请（名称/类型），进入“待审批”状态。
   * 安全设计：本接口不签发任何凭据，批准前设备无法上报数据。
   */
  @Post("register")
  register(@Body() body: Partial<Device>) {
    return this.fleet.registerDevice(body ?? {});
  }

  /** 管理端审批同意：一次性返回设备密钥（请立即配置到设备并妥善保管） */
  @Post(":id/approve")
  approve(@Param("id", ParseIntPipe) id: number) {
    return this.fleet.approveDevice(id);
  }

  /** 管理端拒绝入网 */
  @Post(":id/reject")
  async reject(@Param("id", ParseIntPipe) id: number) {
    await this.fleet.rejectDevice(id);
    return { ok: true };
  }

  /** 注销设备（吊销密钥） */
  @Post(":id/revoke")
  async revoke(@Param("id", ParseIntPipe) id: number) {
    await this.fleet.revokeDevice(id);
    return { ok: true };
  }

  /** 设备端轮询注册状态（仅返回状态，不含密钥） */
  @Get(":id/registration")
  async registration(@Param("id", ParseIntPipe) id: number) {
    const device = await this.fleet.getDevice(id);
    if (!device) {
      return { state: "unknown" };
    }
    return {
      id: device.id,
      state: device.state,
      registeredAt: device.registeredAt,
    };
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

  /**
   * 真实遥测推送：设备端携带批准时签发的密钥（Header: x-device-key）上报，
   * 校验通过后经 Socket 广播 `pm:telemetry` 到前端地图。
   */
  @Post(":id/telemetry")
  @HttpCode(200)
  async telemetry(
    @Param("id", ParseIntPipe) id: number,
    @Headers("x-device-key") deviceKey: string | undefined,
    @Body() body: Partial<TelemetryPoint>,
  ) {
    const device = await this.fleet.authorizeDevice(id, deviceKey);
    const point = this.fleet.pushTelemetry({
      deviceId: device.id,
      lon: Number(body?.lon ?? 0),
      lat: Number(body?.lat ?? 0),
      heading: body?.heading,
      speed: body?.speed,
      battery: body?.battery,
      status: body?.status ?? "online",
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
