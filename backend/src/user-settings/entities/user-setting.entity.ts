import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pm_user_setting')
export class UserSetting {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @Column({ name: 'setting_key', type: 'varchar', length: 64 })
  settingKey!: string;

  @Column({ name: 'setting_value', type: 'varchar', length: 512 })
  settingValue!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
