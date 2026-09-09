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
  Query,
  Res,
} from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator.js";
import { FleetService } from "../fleet/fleet.service.js";
import { DefectsService } from "./defects.service.js";
import type { Response } from "express";

@Controller("defects")
@Public()
export class DefectsController {
  constructor(
    private readonly defects: DefectsService,
    private readonly fleet: FleetService,
  ) {}

  @Get()
  list(
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("q") q?: string,
  ) {
    return this.defects.list({
      status: status ? String(status) : undefined,
      type: type ? String(type) : undefined,
      q: q ? String(q) : undefined,
    });
  }

  /**
   * 上报管道损伤：机器人/终端可携带设备密钥（deviceId + x-device-key）上报，
   * 也可由管理端登录会话（无需密钥）代为录入；图片以 base64 提交。
   */
  @Post()
  async create(
    @Body() body: Record<string, unknown>,
    @Query("device") device?: string,
    @Headers("x-device-key") deviceKey?: string,
  ) {
    let deviceId: number | null = null;
    if (device) {
      deviceId = Number(device);
      if (!deviceId) throw new BadRequestException("device 参数不合法");
      const dev = await this.fleet.authorizeDevice(deviceId, deviceKey);
      body.deviceName = body.deviceName ?? dev.name;
    }
    const created = await this.defects.create({
      deviceId,
      deviceName: body.deviceName != null ? String(body.deviceName) : null,
      type: body.type != null ? String(body.type) : undefined,
      title: body.title != null ? String(body.title) : null,
      description: body.description != null ? String(body.description) : null,
      lon: Number(body.lon ?? 0),
      lat: Number(body.lat ?? 0),
      depthM: body.depthM != null ? Number(body.depthM) : null,
      imageBase64: body.imageBase64 != null ? String(body.imageBase64) : null,
    });
    return created;
  }

  @Get("image/:name")
  image(@Param("name") name: string, @Res() res: Response) {
    const { data, mime } = this.defects.readImage(String(name));
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(data);
  }

  @Patch(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: Partial<{ status: string; title: string; description: string }>) {
    return this.defects.update(id, body ?? {});
  }

  @Delete(":id")
  @HttpCode(200)
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.defects.remove(id);
    return { ok: true };
  }
}
