// 缺陷（管道损伤）上报记录实体
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("pm_defect_report")
export class DefectReport {
  @PrimaryGeneratedColumn()
  id: number;

  /** 上报来源设备（已注册设备上报时带 id，可为空=手工/测试） */
  @Column({ type: "int", nullable: true })
  deviceId: number | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  deviceName: string | null;

  /** 损伤类型：corrosion | crack | leak | dent | cover | other */
  @Column({ type: "varchar", length: 32, default: "other" })
  type: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  title: string | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "double" })
  lon: number;

  @Column({ type: "double" })
  lat: number;

  /** 埋深（米），可空 */
  @Column({ type: "double", nullable: true })
  depthM: number | null;

  /** 存储图片文件名（uploads/defects/ 下） */
  @Column({ type: "varchar", length: 120, nullable: true })
  imageName: string | null;

  /** 处理状态：open(待处理) | processing(处理中) | fixed(已修复) */
  @Column({ type: "varchar", length: 20, default: "open" })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
