// 设备/基站/巡航路线 数据访问与业务逻辑（含注册审批与遥测鉴权）
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomBytes, timingSafeEqual } from "node:crypto";
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
  /** 脱敏视图：设备密钥永不随列表/详情返回（仅在批准时一次性下发） */
  private toView(device: Device): Omit<Device, "secretKey"> {
    const { secretKey: _secret, ...rest } = device;
    void _secret;
    return rest;
  }

  async listDevices() {
    const rows = await this.deviceRepo.find({ order: { createdAt: "ASC" } });
    return rows.map((row) => this.toView(row));
  }

  async getDevice(id: number) {
    const row = await this.deviceRepo.findOneBy({ id });
    return row ? this.toView(row) : null;
  }

  createDevice(input: Partial<Device>): Promise<Device> {
    const device = this.deviceRepo.create({
      name: input.name ?? "未命名设备",
      type: input.type === "drone" ? "drone" : "crawler",
      status: input.status ?? "offline",
      state: "pending",
      secretKey: null,
      registeredAt: null,
      description: input.description ?? null,
    });
    return this.deviceRepo.save(device);
  }

  // ---------- 设备入网：设备发起注册 → 管理端审批 ----------
  /** 设备端调用：提交注册申请，进入待审批状态（不发放任何凭据） */
  async registerDevice(input: Partial<Device>) {
    const name = (input.name ?? "").trim();
    if (!name) throw new BadRequestException("设备名称不能为空");
    const type = input.type === "drone" ? "drone" : input.type === "crawler" ? "crawler" : "crawler";
    const device = this.deviceRepo.create({
      name: name.slice(0, 64),
      type,
      status: "offline",
      state: "pending",
      secretKey: null,
      registeredAt: null,
      description: input.description?.slice(0, 500) ?? null,
    });
    const saved = await this.deviceRepo.save(device);
    return this.toView(saved);
  }

  /** 管理端审批同意：一次性签发设备密钥（仅此一次返回） */
  async approveDevice(id: number): Promise<{ device: Omit<Device, "secretKey">; secret: string }> {
    const device = await this.deviceRepo.findOneByOrFail({ id });
    if (device.state === "approved" && device.secretKey) {
      throw new ConflictException("该设备已注册；密钥只在批准时返回一次，请勿重复审批");
    }
    const secret = randomBytes(32).toString("hex");
    device.state = "approved";
    device.secretKey = secret;
    device.registeredAt = new Date();
    device.status = "offline";
    const saved = await this.deviceRepo.save(device);
    return { device: this.toView(saved), secret };
  }

  /** 管理端拒绝入网 */
  async rejectDevice(id: number) {
    const device = await this.deviceRepo.findOneByOrFail({ id });
    if (device.state !== "pending") throw new ConflictException("仅待审批的设备可以被拒绝");
    device.state = "rejected";
    device.secretKey = null;
    device.registeredAt = null;
    const saved = await this.deviceRepo.save(device);
    return this.toView(saved);
  }

  /** 注销已注册设备（吊销密钥） */
  async revokeDevice(id: number) {
    const device = await this.deviceRepo.findOneByOrFail({ id });
    device.state = "revoked";
    device.secretKey = null;
    device.status = "offline";
    const saved = await this.deviceRepo.save(device);
    return this.toView(saved);
  }

  /** 遥测/指令鉴权：设备密钥必须与批准时签发的一致 */
  async authorizeDevice(id: number, secret: string | undefined): Promise<Device> {
    const device = await this.deviceRepo.findOneByOrFail({ id });
    if (!secret || device.state !== "approved" || !device.secretKey) {
      throw new UnauthorizedException("设备未注册或密钥缺失");
    }
    const a = Buffer.from(device.secretKey, "hex");
    const b = Buffer.from(String(secret), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("设备密钥无效");
    }
    return device;
  }

  async updateDevice(id: number, patch: Partial<Device>) {
    const device = await this.deviceRepo.findOneByOrFail({ id });
    Object.assign(device, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    });
    const saved = await this.deviceRepo.save(device);
    return this.toView(saved);
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
