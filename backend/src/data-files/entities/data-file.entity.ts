import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pm_data_file')
export class DataFile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'mime', type: 'varchar', length: 128, default: 'application/octet-stream' })
  mime!: string;

  @Column({ name: 'size', type: 'bigint', default: 0 })
  size!: string;

  @Column({ name: 'sha256', type: 'char', length: 64, default: '' })
  sha256!: string;

  @Column({ name: 'stored_name', type: 'varchar', length: 255 })
  storedName!: string;

  @Column({ name: 'shared', type: 'tinyint', default: 0 })
  shared!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
