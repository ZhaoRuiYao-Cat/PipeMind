import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pm_user')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'username', type: 'varchar', length: 64, unique: true })
  username!: string;

  @Column({ name: 'status', type: 'smallint', default: 1 })
  status!: number;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
