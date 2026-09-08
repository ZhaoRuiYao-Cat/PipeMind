import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { RsaService } from './rsa.service.js';
import { User } from './entities/user.entity.js';
import { UserSecret } from './entities/user-secret.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface LoginResult extends TokenPair {
  user: {
    id: number;
    username: string;
  };
}

export interface SessionInfo {
  id: number;
  device: string | null;
  ip: string | null;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}

export interface SessionMeta {
  device?: string | null;
  ip?: string | null;
}

interface JwtClaims {
  sub?: string;
  username?: string;
  type?: 'access' | 'refresh';
  jti?: string;
  remember?: boolean;
}

export const ACCESS_TOKEN_COOKIE = 'pm_access_token';
export const REFRESH_TOKEN_COOKIE = 'pm_refresh_token';

const DEFAULT_USERNAME = 'PipeMind';
const DEFAULT_PASSWORD = 'PipeMind';
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly accessTokenTtl: number;

  private readonly refreshTokenTtl: number;

  private readonly rememberTokenTtl: number;

  private dummyHash = '';

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSecret)
    private readonly userSecretRepository: Repository<UserSecret>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly rsaService: RsaService,
    private readonly config: ConfigService,
  ) {
    this.accessTokenTtl = Number(
      this.config.get<string>('AUTH_ACCESS_TOKEN_TTL', '1800') ?? '1800',
    );
    this.refreshTokenTtl = Number(
      this.config.get<string>('AUTH_REFRESH_TOKEN_TTL', '604800') ?? '604800',
    );
    this.rememberTokenTtl = Number(
      this.config.get<string>('AUTH_REMEMBER_TOKEN_TTL', '2592000') ??
        '2592000',
    );
  }

  async onModuleInit(): Promise<void> {
    await this.seedDefaultAccount();
    this.dummyHash = await hash('pipemind-dummy-password', BCRYPT_ROUNDS);
  }

  private async seedDefaultAccount(): Promise<void> {
    // 安装向导可通过 AUTH_ADMIN_USERNAME / AUTH_ADMIN_PASSWORD 配置初始管理员
    const adminUsername =
      this.config.get<string>('AUTH_ADMIN_USERNAME', DEFAULT_USERNAME) ??
      DEFAULT_USERNAME;
    const adminPassword =
      this.config.get<string>('AUTH_ADMIN_PASSWORD', DEFAULT_PASSWORD) ??
      DEFAULT_PASSWORD;
    const existing = await this.userRepository.findOne({
      where: { username: adminUsername },
    });
    if (existing) {
      return;
    }
    const passwordHash = await hash(adminPassword, BCRYPT_ROUNDS);
    const user = await this.userRepository.save(
      this.userRepository.create({ username: adminUsername, status: 1 }),
    );
    await this.userSecretRepository.save(
      this.userSecretRepository.create({
        userId: user.id,
        passwordHash,
        algorithm: 'bcrypt',
      }),
    );
  }

  getPublicKey(): { publicKey: string; name: string; hash: string } {
    return {
      publicKey: this.rsaService.getPublicKeyBase64(),
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    };
  }

  async login(
    username: string,
    encryptedPassword: string,
    remember: boolean,
    meta?: SessionMeta,
  ): Promise<LoginResult> {
    const user = await this.userRepository.findOne({ where: { username } });
    const secret = user
      ? await this.userSecretRepository.findOne({
          where: { userId: user.id },
        })
      : null;

    let plainPassword: string;
    try {
      plainPassword = this.rsaService.decrypt(encryptedPassword);
    } catch {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const matched = await compare(
      plainPassword,
      secret?.passwordHash ?? this.dummyHash,
    );
    if (!user || user.status !== 1 || !matched) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const pair = await this.issueTokenPair(
      user.id,
      user.username,
      remember,
      meta,
    );
    return {
      ...pair,
      user: { id: user.id, username: user.username },
    };
  }

  async refresh(refreshToken: string, meta?: SessionMeta): Promise<TokenPair> {
    let claims: JwtClaims;
    try {
      claims = this.rsaService.verify<JwtClaims>(refreshToken);
    } catch {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    if (claims.type !== 'refresh' || !claims.sub) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    const tokenHash = this.sha256Hex(refreshToken);
    const record = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });
    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    const user = await this.userRepository.findOne({
      where: { id: record.userId },
    });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('账号已被禁用');
    }

    record.revokedAt = new Date();
    await this.refreshTokenRepository.save(record);

    return this.issueTokenPair(
      user.id,
      user.username,
      claims.remember === true,
      meta,
    );
  }

  async updateUsername(
    userId: number,
    username: string,
  ): Promise<{ id: number; username: string }> {    const existing = await this.userRepository.findOne({
      where: { username },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException('用户名已被占用');
    }
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.status !== 1) {
      throw new NotFoundException('用户不存在');
    }
    user.username = username;
    await this.userRepository.save(user);
    return { id: user.id, username: user.username };
  }

  async verifyPassword(
    userId: number,
    encryptedPassword: string,
  ): Promise<{ valid: boolean }> {
    const secret = await this.userSecretRepository.findOne({
      where: { userId },
    });
    if (!secret) {
      return { valid: false };
    }
    let plain: string;
    try {
      plain = this.rsaService.decrypt(encryptedPassword);
    } catch {
      return { valid: false };
    }
    const matched = await compare(plain, secret.passwordHash);
    return { valid: matched };
  }

  async changePassword(
    userId: number,
    encryptedOldPassword: string,
    encryptedNewPassword: string,
  ): Promise<void> {
    const secret = await this.userSecretRepository.findOne({
      where: { userId },
    });
    if (!secret) {
      throw new UnauthorizedException('账户凭据异常，请联系管理员');
    }
    let oldPlain: string;
    let newPlain: string;
    try {
      oldPlain = this.rsaService.decrypt(encryptedOldPassword);
      newPlain = this.rsaService.decrypt(encryptedNewPassword);
    } catch {
      throw new UnauthorizedException('原密码校验失败');
    }
    if (newPlain.length < 6 || newPlain.length > 128) {
      throw new UnauthorizedException('新密码长度需为 6-128 位');
    }
    const matched = await compare(oldPlain, secret.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('原密码错误');
    }
    secret.passwordHash = await hash(newPlain, BCRYPT_ROUNDS);
    await this.userSecretRepository.save(secret);
  }

  async getActiveUser(id: number): Promise<{ id: number; username: string }> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('账号已被禁用');
    }
    return { id: user.id, username: user.username };
  }

  async listSessions(
    userId: number,
    currentRefreshToken: string,
  ): Promise<SessionInfo[]> {
    const currentHash = this.sha256Hex(currentRefreshToken);
    const rows = await this.refreshTokenRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const now = Date.now();
    return rows
      .filter(
        (row) =>
          row.revokedAt === null && row.expiresAt.getTime() > now,
      )
      .map((row) => ({
        id: row.id,
        device: row.device,
        ip: row.ip,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        current: row.tokenHash === currentHash,
      }));
  }

  async revokeSession(
    userId: number,
    sessionId: number,
    currentRefreshToken: string,
  ): Promise<{ revokedCurrent: boolean }> {
    const row = await this.refreshTokenRepository.findOne({
      where: { id: sessionId, userId },
    });
    if (!row) {
      throw new NotFoundException('会话不存在或已被移除');
    }
    if (row.revokedAt === null) {
      row.revokedAt = new Date();
      await this.refreshTokenRepository.save(row);
    }
    return {
      revokedCurrent:
        row.tokenHash === this.sha256Hex(currentRefreshToken),
    };
  }

  async revokeOtherSessions(
    userId: number,
    currentRefreshToken: string,
  ): Promise<{ revokedCount: number }> {
    const currentHash = this.sha256Hex(currentRefreshToken);
    const rows = await this.refreshTokenRepository.find({
      where: { userId },
    });
    const now = Date.now();
    let revokedCount = 0;
    const targets: RefreshToken[] = [];
    for (const row of rows) {
      const isCurrent = row.tokenHash === currentHash;
      if (
        !isCurrent &&
        row.revokedAt === null &&
        row.expiresAt.getTime() > now
      ) {
        row.revokedAt = new Date();
        targets.push(row);
        revokedCount += 1;
      }
    }
    if (targets.length > 0) {
      await this.refreshTokenRepository.save(targets);
    }
    return { revokedCount };
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    let claims: JwtClaims;
    try {
      claims = this.rsaService.verify<JwtClaims>(refreshToken);
    } catch {
      return { success: true };
    }
    if (claims.type !== 'refresh' || !claims.sub) {
      return { success: true };
    }
    const record = await this.refreshTokenRepository.findOne({
      where: { tokenHash: this.sha256Hex(refreshToken) },
    });
    if (record && record.revokedAt === null) {
      record.revokedAt = new Date();
      await this.refreshTokenRepository.save(record);
    }
    return { success: true };
  }

  private async issueTokenPair(
    userId: number,
    username: string,
    remember: boolean,
    meta?: SessionMeta,
  ): Promise<TokenPair> {
    const subject = String(userId);
    const refreshTtl = remember
      ? this.rememberTokenTtl
      : this.refreshTokenTtl;
    const accessToken = this.rsaService.sign(
      { sub: subject, username, type: 'access' },
      this.accessTokenTtl,
    );
    const refreshJti = randomUUID();
    const refreshToken = this.rsaService.sign(
      {
        sub: subject,
        username,
        type: 'refresh',
        jti: refreshJti,
        remember,
      },
      refreshTtl,
    );
    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        userId,
        tokenHash: this.sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        revokedAt: null,
        device: meta?.device ?? null,
        ip: meta?.ip ?? null,
      }),
    );
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtl,
      refreshExpiresIn: refreshTtl,
    };
  }

  private sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
