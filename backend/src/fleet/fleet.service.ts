// 设备/基站/巡航路线 数据访问与业务逻辑（含遥测缓存）
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Device, DeviceRoute, BaseStation } from "./entities/fleet.entities.js";

export interface TelemetryPoint {
  deviceId: number;
  lon: number;
  lat: number;
  heading?: number;
  speed?: number;
  battery?: number;
  status?: string;
  ts?: number;
}

@Injectable()
export class FleetService {
  // 最新遥测（内存缓存，供轮询/断线兜底）
  private telemetry = new Map<number, TelemetryPoint>();

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(DeviceRoute)
    private readonly routeRepo: Repository<DeviceRoute>,
    @InjectRepository(BaseStation)
    private readonly stationRepo: Repository<BaseStation>,
  ) {}

  // ---------- 设备 CRUD ----------
  listDevices(): Promise<Device[]> {
    return this.deviceRepo.find({ order: { createdAt: "ASC" } });
  }

  getDevice(id: number): Promise<Device | null> {
    return this.deviceRepo.findOneBy({ id });
  }

  createDevice(input: Partial<Device>): Promise<Device> {
    const device = this.deviceRepo.create({
      name: input.name ?? "未命名设备",
      type: input.type === "drone" ? "drone" : "crawler",
      status: input.status ?? "offline",
      description: input.description ?? null,
    });
    return this.deviceRepo.save(device);
  }

  async updateDevice(id: number, patch: Partial<Device>): Promise<Device> {
    const device = await this.deviceRepo.findOneByOrFail({ id });
    Object.assign(device, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    });
    return this.deviceRepo.save(device);
  }

  async removeDevice(id: number): Promise<void> {
    await this.routeRepo.delete({ deviceId: id });
    await this.deviceRepo.delete({ id });
    this.telemetry.delete(id);
  }

  // ---------- 巡航路线 ----------
  async getRoute(deviceId: number): Promise<DeviceRoute | null> {
    const rows = await this.routeRepo.find({
      where: { deviceId },
      order: { updatedAt: "DESC" },
    });
    return rows[0] ?? null;
  }

  async saveRoute(
    deviceId: number,
    input: { source?: { kind: string; id: number; name: string }; points: Array<{ lon: number; lat: number }> },
  ): Promise<DeviceRoute> {
    const rows = await this.routeRepo.find({ where: { deviceId } });
    const row = rows[0] ?? this.routeRepo.create({ deviceId });
    row.sourceText = JSON.stringify(input.source ?? null);
    row.pointsText = JSON.stringify(input.points ?? []);
    row.status = "active";
    return this.routeRepo.save(row);
  }

  // ---------- 基站 CRUD ----------
  listStations(): Promise<BaseStation[]> {
    return this.stationRepo.find({ order: { createdAt: "ASC" } });
  }

  getStation(id: number): Promise<BaseStation | null> {
    return this.stationRepo.findOneBy({ id });
  }

  createStation(input: Partial<BaseStation>): Promise<BaseStation> {
    const station = this.stationRepo.create({
      name: input.name ?? "基站",
      lon: Number(input.lon) || 0,
      lat: Number(input.lat) || 0,
      purpose: input.purpose ?? "charging",
      description: input.description ?? null,
    });
    return this.stationRepo.save(station);
  }

  async updateStation(id: number, patch: Partial<BaseStation>): Promise<BaseStation> {
    const station = await this.stationRepo.findOneByOrFail({ id });
    Object.assign(station, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.lon !== undefined ? { lon: Number(patch.lon) } : {}),
      ...(patch.lat !== undefined ? { lat: Number(patch.lat) } : {}),
      ...(patch.purpose !== undefined ? { purpose: patch.purpose } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    });
    return this.stationRepo.save(station);
  }

  async removeStation(id: number): Promise<void> {
    await this.stationRepo.delete({ id });
  }

  // ---------- 遥测 ----------
  /** 外部设备/检测终端通过 REST 或 Socket 推送真实数据 */
  pushTelemetry(point: TelemetryPoint): TelemetryPoint {
    const normalized: TelemetryPoint = {
      deviceId: point.deviceId,
      lon: Number(point.lon) || 0,
      lat: Number(point.lat) || 0,
      heading: point.heading,
      speed: point.speed,
      battery: point.battery,
      status: point.status ?? "online",
      ts: point.ts ?? Date.now(),
    };
    this.telemetry.set(normalized.deviceId, normalized);
    return normalized;
  }

  latestTelemetry(): TelemetryPoint[] {
    return Array.from(this.telemetry.values());
  }

  telemetryOf(deviceId: number): TelemetryPoint | null {
    return this.telemetry.get(deviceId) ?? null;
  }

  clearTelemetry(): void {
    this.telemetry.clear();
  }
}
