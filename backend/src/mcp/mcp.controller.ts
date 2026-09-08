import {
  All,
  Controller,
  Get,
  HttpCode,
  Req,
  Res,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpService, runAsUser } from './mcp.service.js';
import { REFRESH_TOKEN_COOKIE } from '../auth/auth.service.js';
import type { AuthenticatedUser } from '../auth/decorators/authenticated-user.interface.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

@Controller('mcp')
export class McpController {
  private readonly sessions = new Map<string, McpSession>();

  constructor(private readonly mcpService: McpService) {}

  @Get('status')
  async status() {
    const status = this.mcpService.getStatus();
    return {
      ...status,
      protocol: 'streamable-http',
      sessionCount: this.sessions.size,
    };
  }

  @All()
  @HttpCode(200)
  async handle(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<void> {
    const userId = user?.id ?? 0;
    const refreshToken = this.readRefreshToken(req);

    if (req.method === 'DELETE') {
      const sessionId = this.readSessionId(req);
      const session = sessionId
        ? this.sessions.get(sessionId)
        : undefined;
      if (session) {
        await session.transport.close();
        await session.server.close();
        if (sessionId) {
          this.sessions.delete(sessionId);
        }
      }
      res.status(200).json({ success: true });
      return;
    }

    const sessionId = this.readSessionId(req);
    let session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session) {
      session = await this.createSession();
    }

    await runAsUser(userId, refreshToken, () =>
      session!.transport.handleRequest(req, res, req.body),
    );
  }

  private async createSession(): Promise<McpSession> {
    const server = this.mcpService.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (createdSessionId) => {
        this.sessions.set(createdSessionId, { server, transport });
      },
      onsessionclosed: (closedSessionId) => {
        this.sessions.delete(closedSessionId);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        this.sessions.delete(transport.sessionId);
      }
    };
    await server.connect(transport);
    return { server, transport };
  }

  private readSessionId(req: Request): string | undefined {
    const raw = req.headers['mcp-session-id'];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }

  private readRefreshToken(req: Request): string {
    const value = req.cookies?.[REFRESH_TOKEN_COOKIE];
    return typeof value === 'string' ? value : '';
  }
}
