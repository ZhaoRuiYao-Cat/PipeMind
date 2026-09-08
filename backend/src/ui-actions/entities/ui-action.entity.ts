import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('pm_ui_action')
export class UiAction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @Column({ name: 'action', type: 'varchar', length: 32 })
  action!: string;

  @Column({ name: 'params', type: 'text' })
  params!: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @Column({ name: 'message', type: 'varchar', length: 500, nullable: true })
  message!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
