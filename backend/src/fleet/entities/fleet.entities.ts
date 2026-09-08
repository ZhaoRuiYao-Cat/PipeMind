// 设备 / 基站 / 巡航路线 实体
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("pm_device")
export class Device {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 64 })
  name: string;

  /** crawler(管道机器人) | drone(无人机) */
  @Column({ length: 20 })
  type: "crawler" | "drone";

  /** offline | online | busy | fault */
  @Column({ length: 20, default: "offline" })
  status: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity("pm_device_route")
export class DeviceRoute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  deviceId: number;

  /** 路线来源：基于哪个数据源规划的（本地文件/API） */
  @Column({ type: "text", nullable: true })
  sourceText: string | null;

  /** JSON 字符串：{ lon, lat }[] */
  @Column({ type: "text", nullable: true })
  pointsText: string | null;

  /** 状态：active | paused | finished */
  @Column({ length: 20, default: "active" })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity("pm_base_station")
export class BaseStation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 64 })
  name: string;

  @Column("double")
  lon: number;

  @Column("double")
  lat: number;

  /** charging | relay | command 等用途标注 */
  @Column({ length: 32, default: "charging" })
  purpose: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
