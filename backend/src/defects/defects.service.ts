// 缺陷记录：图片落盘(uploads/defects) + 元数据入库
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Like, Repository } from "typeorm";
import { DefectReport } from "./entities/defect-report.entity.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 源文件位于 backend/src/defects，或编译后 backend/dist/defects，两层上跳即 backend 根
const DEFECT_DIR = resolve(__dirname, "../../../uploads/defects");
const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface CreateDefectInput {
  deviceId?: number | null;
  deviceName?: string | null;
  type?: string;
  title?: string | null;
  description?: string | null;
  lon?: number;
  lat?: number;
  depthM?: number | null;
  /** data:image/...;base64,.... 或纯 base64 */
  imageBase64?: string | null;
}

@Injectable()
export class DefectsService {
  constructor(
    @InjectRepository(DefectReport)
    private readonly repo: Repository<DefectReport>,
  ) {}

  private toView(row: DefectReport) {
    return {
      ...row,
      imageUrl: row.imageName ? `/api/defects/image/${row.imageName}` : null,
    };
  }

  private saveImage(imageBase64: string): string {
    if (typeof imageBase64 !== "string" || !imageBase64) {
      return "";
    }
    const match = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(imageBase64.trim());
    const b64 = match ? match[2] : imageBase64.trim();
    let ext = ".jpg";
    if (match) {
      const mime = match[1];
      const found = Object.entries(IMAGE_MIME).find(([, v]) => v === mime);
      if (found) ext = found[0];
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(b64)) {
      throw new BadRequestException("图片内容不是合法的 base64");
    }
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) {
      throw new BadRequestException("图片大小需在 0 ~ 8MB 之间");
    }
    mkdirSync(DEFECT_DIR, { recursive: true });
    const name = `${randomUUID().replace(/-/g, "")}${ext}`;
    writeFileSync(join(DEFECT_DIR, name), buf);
    return name;
  }

  async create(input: CreateDefectInput): Promise<DefectReport> {
    const lon = Number(input.lon ?? 0);
    const lat = Number(input.lat ?? 0);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new BadRequestException("位置（lon/lat）不合法");
    }
    const type = String(input.type ?? "other").slice(0, 32);
    const row = this.repo.create({
      deviceId: input.deviceId != null ? Number(input.deviceId) : null,
      deviceName: input.deviceName?.slice(0, 64) ?? null,
      type,
      title: input.title?.slice(0, 120) ?? null,
      description: input.description?.slice(0, 2000) ?? null,
      lon,
      lat,
      depthM: input.depthM != null ? Number(input.depthM) : null,
      imageName: input.imageBase64 ? this.saveImage(input.imageBase64) : null,
      status: "open",
    });
    const saved = await this.repo.save(row);
    return this.toView(saved) as DefectReport;
  }

  async list(filter: { status?: string; type?: string; q?: string } = {}): Promise<DefectReport[]> {
    const where: Record<string, unknown> = {};
    if (filter.status) where.status = filter.status;
    if (filter.type) where.type = filter.type;
    if (filter.q) {
      const q = filter.q;
      const rows = await this.repo.find({
        where: filter.status || filter.type
          ? [{ ...where, title: Like(`%${q}%`) }, { ...where, description: Like(`%${q}%`) }, { ...where, deviceName: Like(`%${q}%`) }]
          : [{ title: Like(`%${q}%`) }, { description: Like(`%${q}%`) }, { deviceName: Like(`%${q}%`) }],
        order: { createdAt: "DESC" },
      });
      return rows.map((r) => this.toView(r) as DefectReport);
    }
    const rows = await this.repo.find({ where, order: { createdAt: "DESC" } });
    return rows.map((r) => this.toView(r) as DefectReport);
  }

  async update(id: number, patch: Partial<DefectReport>): Promise<DefectReport> {
    const row = await this.repo.findOneBy({ id });
    if (!row) throw new NotFoundException("记录不存在");
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.description !== undefined) row.description = patch.description;
    const saved = await this.repo.save(row);
    return this.toView(saved) as DefectReport;
  }

  async remove(id: number): Promise<void> {
    const row = await this.repo.findOneBy({ id });
    if (!row) throw new NotFoundException("记录不存在");
    if (row.imageName) {
      try {
        rmSync(join(DEFECT_DIR, row.imageName), { force: true });
      } catch {
        /* ignore */
      }
    }
    await this.repo.remove(row);
  }

  readImage(name: string): { data: Buffer; mime: string } {
    if (!/^[a-f0-9]{32,}\.(jpg|jpeg|png|webp|gif)$/i.test(name)) {
      throw new BadRequestException("非法图片名");
    }
    const filePath = join(DEFECT_DIR, name);
    if (!existsSync(filePath)) {
      throw new NotFoundException("图片不存在");
    }
    const ext = extname(name).toLowerCase();
    return { data: readFileSync(filePath), mime: IMAGE_MIME[ext] ?? "image/jpeg" };
  }
}
