import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSetting } from './entities/user-setting.entity.js';

const MAX_KEYS = 50;
const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 512;

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(UserSetting)
    private readonly settingRepository: Repository<UserSetting>,
  ) {}

  async getAll(userId: number): Promise<Record<string, string>> {
    const rows = await this.settingRepository.find({
      where: { userId },
    });
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.settingKey] = row.settingValue;
    }
    return result;
  }

  async get(userId: number, key: string): Promise<string | undefined> {
    const row = await this.settingRepository.findOne({
      where: { userId, settingKey: key },
    });
    return row?.settingValue;
  }

  async upsertAll(
    userId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const entries = Object.entries(input);
    if (entries.length > MAX_KEYS) {
      throw new BadRequestException('设置项数量超限');
    }
    const sanitized: Array<{ key: string; value: string }> = [];
    for (const [key, raw] of entries) {
      if (
        key.length === 0 ||
        key.length > MAX_KEY_LENGTH ||
        typeof raw !== 'string' ||
        raw.length > MAX_VALUE_LENGTH
      ) {
        throw new BadRequestException('设置项格式非法');
      }
      sanitized.push({ key, value: raw });
    }
    for (const item of sanitized) {
      const existing = await this.settingRepository.findOne({
        where: { userId, settingKey: item.key },
      });
      if (existing) {
        existing.settingValue = item.value;
        await this.settingRepository.save(existing);
      } else {
        await this.settingRepository.save(
          this.settingRepository.create({
            userId,
            settingKey: item.key,
            settingValue: item.value,
          }),
        );
      }
    }
    return this.getAll(userId);
  }
}
