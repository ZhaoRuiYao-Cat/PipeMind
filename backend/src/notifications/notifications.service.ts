import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity.js';

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: Date;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async createNotification(
    userId: number,
    type: string,
    title: string,
    content: string,
  ): Promise<void> {
    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId,
        type,
        title,
        content,
        isRead: false,
      }),
    );
  }

  async listForUser(userId: number): Promise<{
    items: NotificationItem[];
    unread: number;
  }> {
    const items = await this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return {
      items,
      unread: items.filter((item) => !item.isRead).length,
    };
  }

  async markRead(userId: number, id: number): Promise<void> {
    const result = await this.notificationRepository.update(
      { id, userId, isRead: false },
      { isRead: true },
    );
    if (result.affected === 0) {
      const exists = await this.notificationRepository.exists({
        where: { id, userId },
      });
      if (!exists) {
        throw new NotFoundException('信息不存在');
      }
    }
  }

  async markAllRead(userId: number): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  async remove(userId: number, id: number): Promise<void> {
    const result = await this.notificationRepository.delete({ id, userId });
    if (result.affected === 0) {
      throw new NotFoundException('信息不存在');
    }
  }
}
