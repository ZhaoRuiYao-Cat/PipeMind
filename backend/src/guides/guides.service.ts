import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuideTask } from './entities/guide-task.entity.js';

export interface GuideView {
  id: number;
  action: string;
  params: Record<string, unknown>;
  status: string;
  createdAt: Date;
}

@Injectable()
export class GuidesService {
  constructor(
    @InjectRepository(GuideTask)
    private readonly guideRepository: Repository<GuideTask>,
  ) {}

  async create(
    userId: number,
    action: string,
    params: Record<string, unknown>,
  ): Promise<GuideView> {
    const row = await this.guideRepository.save(
      this.guideRepository.create({
        userId,
        action,
        params: JSON.stringify(params),
        status: 'pending',
      }),
    );
    return this.toView(row);
  }

  async listPending(userId: number): Promise<GuideView[]> {
    const rows = await this.guideRepository.find({
      where: { userId, status: 'pending' },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.toView(row));
  }

  async complete(userId: number, id: number): Promise<GuideView> {
    const row = await this.guideRepository.findOne({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException('引导任务不存在');
    }
    row.status = 'done';
    const saved = await this.guideRepository.save(row);
    return this.toView(saved);
  }

  private toView(row: GuideTask): GuideView {
    let params: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.params) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        params = parsed as Record<string, unknown>;
      }
    } catch {
      params = {};
    }
    return {
      id: row.id,
      action: row.action,
      params,
      status: row.status,
      createdAt: row.createdAt,
    };
  }
}
