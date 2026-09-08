// Socket.IO 网关：向已连接前端实时广播设备遥测 / 状态
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { TelemetryPoint } from "./fleet.service.js";

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  path: "/socket.io",
})
export class FleetGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    client.emit("pm:hello", { ts: Date.now() });
  }

  /** 向所有前端广播某设备的实时位置（由遥测推送触发） */
  broadcastTelemetry(point: TelemetryPoint): void {
    this.server.emit("pm:telemetry", point);
  }

  /** 基站列表发生变化（新增/编辑/删除）→ 前端首页重新拉取 */
  broadcastStationsChanged(): void {
    this.server.emit("pm:stations-changed");
  }

  /** 设备入网状态变化（注册/审批/注销/删除）→ 前端首页重新拉取设备 */
  broadcastDevicesChanged(): void {
    this.server.emit("pm:devices-changed");
  }

  /** 外部设备/检测终端通过 Socket 推送真实数据 */
  @SubscribeMessage("device:telemetry")
  onDeviceTelemetry(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: TelemetryPoint,
  ): TelemetryPoint {
    const normalized: TelemetryPoint = {
      deviceId: Number(body?.deviceId) || 0,
      lon: Number(body?.lon) || 0,
      lat: Number(body?.lat) || 0,
      heading: body?.heading,
      speed: body?.speed,
      battery: body?.battery,
      status: body?.status ?? "online",
      ts: body?.ts ?? Date.now(),
    };
    client.broadcast.emit("pm:telemetry", normalized);
    return normalized;
  }

  /** 向设备下发指令的通道（对外预留，返回 ack） */
  @SubscribeMessage("device:command")
  onCommand(@MessageBody() body: { deviceId?: number; action?: string }): { ok: true; echo: unknown } {
    return { ok: true, echo: body ?? {} };
  }
}
