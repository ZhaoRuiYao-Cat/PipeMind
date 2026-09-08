import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RsaService } from './rsa.service.js';
import { ACCESS_TOKEN_COOKIE } from './auth.service.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';
import type { AuthenticatedUser } from './decorators/authenticated-user.interface.js';

interface RequestWithAuth {
  cookies?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  user?: AuthenticatedUser;
}

interface AccessTokenClaims {
  sub?: string;
  username?: string;
  type?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rsaService: RsaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<RequestWithAuth>();
    const headerToken = this.readBearerToken(request.headers);
    const cookieToken =
      typeof request.cookies?.[ACCESS_TOKEN_COOKIE] === 'string'
        ? (request.cookies[ACCESS_TOKEN_COOKIE] as string)
        : '';
    const token = headerToken || cookieToken;
    if (!token) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    let claims: AccessTokenClaims;
    try {
      claims = this.rsaService.verify<AccessTokenClaims>(token);
    } catch {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    const userId = Number(claims.sub);
    if (
      claims.type !== 'access' ||
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    request.user = {
      id: userId,
      username: claims.username ?? '',
    };
    return true;
  }

  private readBearerToken(
    headers: Record<string, unknown> | undefined,
  ): string {
    if (!headers) {
      return '';
    }
    const raw = headers['authorization'];
    if (typeof raw !== 'string') {
      return '';
    }
    const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
    return match ? match[1] : '';
  }
}
