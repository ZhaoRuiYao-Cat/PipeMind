import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pm_ai_provider')
export class AiProvider {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ name: 'provider_key', type: 'varchar', length: 32 })
  providerKey!: string;

  @Column({ name: 'base_url', type: 'varchar', length: 512, nullable: true })
  baseUrl!: string | null;

  @Column({ name: 'api_key_cipher', type: 'text', nullable: true })
  apiKeyCipher!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
