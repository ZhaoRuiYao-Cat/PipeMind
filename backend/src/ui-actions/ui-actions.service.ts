import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UiAction } from './entities/ui-action.entity.js';

export interface UiActionView {
  id: number;
  action: string;
  params: Record<string, unknown>;
  status: string;
  message: string | null;
  createdAt: Date;
}

export type UiActionStatus = 'pending' | 'done' | 'failed';

@Injectable()
export class UiActionsService {
  constructor(
    @InjectRepository(UiAction)
    private readonly actionRepository: Repository<UiAction>,
  ) {}

  async create(
    userId: number,
    action: string,
    params: Record<string, unknown>,
  ): Promise<UiActionView> {
    const row = await this.actionRepository.save(
      this.actionRepository.create({
        userId,
        action,
        params: JSON.stringify(params),
        status: 'pending',
      }),
    );
    return this.toView(row);
  }

  async listPending(userId: number): Promise<UiActionView[]> {
    const rows = await this.actionRepository.find({
      where: { userId, status: 'pending' },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.toView(row));
  }

  async resolve(
    userId: number,
    id: number,
    status: UiActionStatus,
    message?: string,
  ): Promise<UiActionView> {
    const row = await this.actionRepository.findOne({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException('界面指令不存在');
    }
    if (row.status !== 'pending') {
      return this.toView(row);
    }
    row.status = status;
    row.message = message ?? null;
    const saved = await this.actionRepository.save(row);
    return this.toView(saved);
  }

  private toView(row: UiAction): UiActionView {
    let params: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.params) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
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
      message: row.message,
      createdAt: row.createdAt,
    };
  }
}
