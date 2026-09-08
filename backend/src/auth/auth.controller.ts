import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, CookieOptions } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  AuthService,
  REFRESH_TOKEN_COOKIE,
} from './auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthenticatedUser } from './decorators/authenticated-user.interface.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UserSettingsService } from '../user-settings/user-settings.service.js';
import { LoginDto } from './dto/login.dto.js';
import { UpdateUsernameDto } from './dto/update-username.dto.js';
import { PasswordPayloadDto } from './dto/password-payload.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

function resolveClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return request.ip ?? '';
}

function resolveDevice(userAgent: unknown): string {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  const uaLower = ua.toLowerCase();
  let os = '未知设备';
  if (uaLower.includes('windows')) {
    os = 'Windows';
  } else if (uaLower.includes('mac os') || uaLower.includes('macintosh')) {
    os = 'macOS';
  } else if (uaLower.includes('iphone')) {
    os = 'iPhone';
  } else if (uaLower.includes('ipad')) {
    os = 'iPad';
  } else if (uaLower.includes('android')) {
    os = 'Android';
  } else if (uaLower.includes('linux')) {
    os = 'Linux';
  }
  let browser = '浏览器';
  if (uaLower.includes('edg/')) {
    browser = 'Edge';
  } else if (uaLower.includes('chrome')) {
    browser = 'Chrome';
  } else if (uaLower.includes('firefox')) {
    browser = 'Firefox';
  } else if (uaLower.includes('safari')) {
    browser = 'Safari';
  }
  return `${os} · ${browser}`;
}

@Controller('auth')
export class AuthController {
  private readonly cookieSecure: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly userSettingsService: UserSettingsService,
  ) {
    this.cookieSecure =
      this.config.get<string>('COOKIE_SECURE', 'false') === 'true';
  }

  @Public()
  @Get('public-key')
  getPublicKey(): { publicKey: string; name: string; hash: string } {
    return this.authService.getPublicKey();
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ip = resolveClientIp(request);
    const device = resolveDevice(request.headers['user-agent']);
    const result = await this.authService.login(
      dto.username,
      dto.encryptedPassword,
      dto.remember === true,
      { ip, device },
    );
    this.setAuthCookies(response, result.accessToken, result.refreshToken, {
      accessTtl: result.expiresIn,
      refreshTtl: result.refreshExpiresIn,
    });
    const loginTime = new Date().toLocaleString('zh-CN', {
      hour12: false,
    });
    const loginNotifySetting = await this.userSettingsService.get(
      result.user.id,
      'security.login_notify',
    );
    if (loginNotifySetting !== 'false') {
      await this.notificationsService.createNotification(
        result.user.id,
        'login',
        '账号登录提醒',
        `登录时间：${loginTime}；登录 IP：${ip}；登录设备：${device}`,
      );
    }
    return {
      user: result.user,
      expiresIn: result.expiresIn,
      refreshExpiresIn: result.refreshExpiresIn,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken =
      typeof request.cookies?.[REFRESH_TOKEN_COOKIE] === 'string'
        ? request.cookies[REFRESH_TOKEN_COOKIE]
        : '';
    if (!refreshToken) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    const result = await this.authService.refresh(refreshToken, {
      ip: resolveClientIp(request),
      device: resolveDevice(request.headers['user-agent']),
    });
    this.setAuthCookies(response, result.accessToken, result.refreshToken, {
      accessTtl: result.expiresIn,
      refreshTtl: result.refreshExpiresIn,
    });
    return {
      expiresIn: result.expiresIn,
      refreshExpiresIn: result.refreshExpiresIn,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken =
      typeof request.cookies?.[REFRESH_TOKEN_COOKIE] === 'string'
        ? request.cookies[REFRESH_TOKEN_COOKIE]
        : '';
    await this.authService.logout(refreshToken);
    response.clearCookie(ACCESS_TOKEN_COOKIE, this.clearCookieOptions());
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.clearCookieOptions());
    return { success: true };
  }

  @Get('me')
  @HttpCode(200)
  async me(@CurrentUser() user?: AuthenticatedUser) {
    if (!user) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    const activeUser = await this.authService.getActiveUser(user.id);
    return { user: activeUser };
  }

  @Patch('username')
  @HttpCode(200)
  async updateUsername(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpdateUsernameDto,
  ) {
    if (!user) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    const updated = await this.authService.updateUsername(
      user.id,
      dto.username,
    );
    return { user: updated };
  }

  @Patch('password/verify')
  @HttpCode(200)
  async verifyPassword(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: PasswordPayloadDto,
  ) {
    if (!user) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    return this.authService.verifyPassword(user.id, dto.encryptedPassword);
  }

  @Patch('password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    if (!user) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    await this.authService.changePassword(
      user.id,
      dto.encryptedOldPassword,
      dto.encryptedNewPassword,
    );
    return { success: true };
  }

  @Get('sessions')
  @HttpCode(200)
  async listSessions(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
  ) {
    if (!user) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    const sessions = await this.authService.listSessions(
      user.id,
      this.readRefreshToken(request),
    );
    return { sessions };
  }

  @Delete('sessions/others')
  @HttpCode(200)
  async revokeOtherSessions(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
  ) {
    if (!user) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    return this.authService.revokeOtherSessions(
      user.id,
      this.readRefreshToken(request),
    );
  }

  @Delete('sessions/:id')
  @HttpCode(200)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!user) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    const result = await this.authService.revokeSession(
      user.id,
      id,
      this.readRefreshToken(request),
    );
    if (result.revokedCurrent) {
      response.clearCookie(ACCESS_TOKEN_COOKIE, this.clearCookieOptions());
      response.clearCookie(REFRESH_TOKEN_COOKIE, this.clearCookieOptions());
    }
    return result;
  }

  private readRefreshToken(request: Request): string {
    return typeof request.cookies?.[REFRESH_TOKEN_COOKIE] === 'string'
      ? request.cookies[REFRESH_TOKEN_COOKIE]
      : '';
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
    ttl: { accessTtl: number; refreshTtl: number },
  ): void {
    response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.baseCookieOptions(),
      maxAge: ttl.accessTtl * 1000,
    });
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.baseCookieOptions(),
      maxAge: ttl.refreshTtl * 1000,
    });
  }

  private baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.cookieSecure,
      path: '/',
    };
  }

  private clearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.cookieSecure,
      path: '/',
    };
  }
}
