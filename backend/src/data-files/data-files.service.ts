import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { DataFile } from './entities/data-file.entity.js';
import { User } from '../auth/entities/user.entity.js';

export interface DataFileView {
  id: number;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  shared: boolean;
  createdAt: Date;
  owner?: { id: number; username: string };
}

const FALLBACK_NAME = '未命名文件';
const SIZE_ERROR = Symbol('size-exceeded');

@Injectable()
export class DataFilesService {
  private readonly storageRoot: string;

  constructor(
    @InjectRepository(DataFile)
    private readonly dataFileRepository: Repository<DataFile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.storageRoot = resolve(
      process.env.DATA_UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
    );
  }

  private storageDir(userId: number): string {
    return join(this.storageRoot, `user-${userId}`);
  }

  private userFilePath(userId: number, storedName: string): string {
    return join(this.storageDir(userId), storedName);
  }

  private sanitizeFileName(rawName: string | undefined | null): string {
    const cleaned = basename(rawName ?? '').replace(/[\u0000-\u001f\u007f]/g, '');
    return cleaned.length > 0 ? cleaned.slice(0, 255) : FALLBACK_NAME;
  }

  private sanitizeExtension(name: string): string {
    const ext = extname(name).toLowerCase();
    const allowed = ext.replace(/[^a-z0-9.]/g, '');
    if (allowed.length < 2 || allowed.length > 16) {
      return '';
    }
    return allowed;
  }

  private maxBytes(): number {
    const fromEnv = Number(process.env.DATA_FILE_MAX_BYTES ?? '0');
    return fromEnv > 0 ? fromEnv : 2 * 1024 * 1024 * 1024;
  }

  private normalizeMime(mime: string | undefined): string {
    const value = (mime ?? 'application/octet-stream')
      .split(';')[0]
      .trim()
      .toLowerCase();
    return value.length > 0 && value.length <= 128
      ? value
      : 'application/octet-stream';
  }

  /**
   * 流式接收上传请求体，边写盘边计 SHA-256 与字节数。
   * @param userId - 文件所属用户 id
   * @param request - 原始 HTTP 请求（body 为文件字节流）
   * @param rawName - 上传时提供的文件名
   * @param mime - 文件 MIME 类型
   * @param shared - 是否共享
   */
  async upload(
    userId: number,
    request: Request,
    rawName: string | undefined,
    mime: string | undefined,
    shared: boolean,
  ): Promise<DataFileView> {
    const name = this.sanitizeFileName(rawName);
    const ext = this.sanitizeExtension(name);
    const storedName = `${randomUUID()}${ext}`;
    const dir = this.storageDir(userId);
    const targetPath = this.userFilePath(userId, storedName);
    const partPath = `${targetPath}.part`;
    const maxBytes = this.maxBytes();

    const declaredLength = Number(request.headers['content-length'] ?? '0');
    if (declaredLength > maxBytes) {
      throw new PayloadTooLargeException('文件超过允许的大小上限');
    }

    await mkdir(dir, { recursive: true });
    const hash = createHash('sha256');
    let size = 0;

    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        hash.update(chunk);
        if (size > maxBytes) {
          callback(SIZE_ERROR as unknown as Error);
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        request as unknown as NodeJS.ReadableStream,
        counter,
        createWriteStream(partPath, { flags: 'wx' }),
      );
    } catch (error) {
      await rm(partPath, { force: true });
      if (error === SIZE_ERROR) {
        throw new PayloadTooLargeException('文件超过允许的大小上限');
      }
      throw new BadRequestException('文件上传失败');
    }

    if (size === 0) {
      await rm(partPath, { force: true });
      throw new BadRequestException('上传内容为空');
    }

    const fileStat = await stat(partPath);
    if (fileStat.size !== size) {
      await rm(partPath, { force: true });
      throw new BadRequestException('上传内容不完整');
    }

    await rename(partPath, targetPath);
    const sha256 = hash.digest('hex');

    try {
      const row = await this.dataFileRepository.save(
        this.dataFileRepository.create({
          userId,
          name,
          mime: this.normalizeMime(mime),
          size: String(size),
          sha256,
          storedName,
          shared: shared ? 1 : 0,
        }),
      );
      return this.toView(row);
    } catch (error) {
      await rm(targetPath, { force: true });
      throw error;
    }
  }

  async listMine(userId: number): Promise<DataFileView[]> {
    const rows = await this.dataFileRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toView(row));
  }

  async listShared(exceptUserId: number): Promise<DataFileView[]> {
    const rows = await this.dataFileRepository.find({
      where: { shared: 1 },
      order: { createdAt: 'DESC' },
    });
    const owners = await this.loadOwners(
      rows.map((row) => row.userId).filter((id) => id !== exceptUserId),
    );
    return rows
      .filter((row) => row.userId !== exceptUserId)
      .map((row) => {
        const owner = owners.get(row.userId);
        return this.toView(row, owner);
      });
  }

  private async loadOwners(
    userIds: number[],
  ): Promise<Map<number, { id: number; username: string }>> {
    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id IN (:...ids)', { ids: uniqueIds })
      .getMany();
    return new Map(
      users.map((user) => [user.id, { id: user.id, username: user.username }]),
    );
  }

  async setShared(
    userId: number,
    id: number,
    shared: boolean,
  ): Promise<DataFileView> {
    const row = await this.findOwned(userId, id);
    row.shared = shared ? 1 : 0;
    const saved = await this.dataFileRepository.save(row);
    return this.toView(saved);
  }

  async remove(userId: number, id: number): Promise<{ id: number }> {
    const row = await this.findOwned(userId, id);
    await this.dataFileRepository.remove(row);
    await rm(this.userFilePath(row.userId, row.storedName), { force: true });
    return { id: row.id };
  }

  /**
   * 校验文件可访问性（属主或已共享）。
   * @param userId - 当前用户 id
   * @param id - 文件记录 id
   */
  async findAccessible(
    userId: number,
    id: number,
  ): Promise<{ row: DataFile; view: DataFileView }> {
    const row = await this.dataFileRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('文件不存在');
    }
    if (row.userId !== userId && row.shared !== 1) {
      throw new ForbiddenException('无权访问该文件');
    }
    const owners = await this.loadOwners([row.userId]);
    const view = this.toView(row, owners.get(row.userId));
    return { row, view };
  }

  /**
   * 读取文件全文（属主或共享可见）。
   * @param userId - 当前用户 id
   * @param id - 文件记录 id
   * @returns {Promise<string>} 文本内容
   */
  async readText(userId: number, id: number): Promise<string> {
    const { row } = await this.findAccessible(userId, id);
    const filePath = this.userFilePath(row.userId, row.storedName);
    return readFile(filePath, 'utf8');
  }

  /**
   * 已注册设备读取“系统 GIS 数据源”内容（权限校验由 Fleet 层按设备密钥完成）。
   * @param id - 文件记录 id
   * @returns {Promise<string>} 文本内容
   */
  async readForDevice(id: number): Promise<string> {
    const row = await this.dataFileRepository.findOneBy({ id });
    if (!row) {
      throw new NotFoundException('文件不存在');
    }
    const filePath = this.userFilePath(row.userId, row.storedName);
    return readFile(filePath, 'utf8');
  }

  /**
   * 流式输出文件内容。
   * @param res - express 响应对象
   * @param row - 文件记录
   */
  async streamContent(res: Response, row: DataFile): Promise<void> {
    const filePath = this.userFilePath(row.userId, row.storedName);
    await stat(filePath);
    const encodedName = encodeURIComponent(row.name);
    res.setHeader('Content-Type', row.mime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodedName}`,
    );
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const stream = createReadStream(filePath);
      const onError = (error: Error): void => {
        stream.destroy();
        rejectPromise(error);
      };
      stream.on('error', onError);
      res.on('close', () => stream.destroy());
      stream.on('end', resolvePromise);
      stream.pipe(res);
    });
  }

  private async findOwned(userId: number, id: number): Promise<DataFile> {
    const row = await this.dataFileRepository.findOne({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException('文件不存在');
    }
    return row;
  }

  private toView(
    row: DataFile,
    owner?: { id: number; username: string },
  ): DataFileView {
    const view: DataFileView = {
      id: row.id,
      name: row.name,
      mime: row.mime,
      size: this.toSafeNumber(row.size),
      sha256: row.sha256,
      shared: row.shared === 1,
      createdAt: row.createdAt,
    };
    if (owner) {
      view.owner = owner;
    }
    return view;
  }

  private toSafeNumber(value: string | number): number {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  }
}
