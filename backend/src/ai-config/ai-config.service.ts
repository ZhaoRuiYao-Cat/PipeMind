import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiProvider } from './entities/ai-provider.entity.js';
import { AiSecretService, maskApiKey } from './ai-secret.service.js';

const SUPPORTED_KEYS = ['openai', 'deepseek', 'gemini', 'doubao'];

const PROVIDER_CAPABILITIES: Record<string, string[]> = {
  openai: ['deepThinking', 'webSearch'],
  deepseek: ['deepThinking'],
  gemini: ['webSearch'],
  doubao: ['deepThinking', 'webSearch'],
};

export interface ProviderView {
  key: string;
  baseUrl: string | null;
  hasKey: boolean;
  maskedKey: string | null;
  active: boolean;
  capabilities: string[];
}

export interface ProviderInput {
  key: string;
  baseUrl?: string;
  apiKey?: string;
  active?: boolean;
}

export interface TestProviderInput {
  key: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface TestResult {
  ok: boolean;
  code:
    | 'not_configured'
    | 'unreachable'
    | 'http_error'
    | 'unauthorized'
    | 'success';
  status?: number;
  detail?: string;
}

@Injectable()
export class AiConfigService implements OnModuleInit {
  constructor(
    @InjectRepository(AiProvider)
    private readonly providerRepository: Repository<AiProvider>,
    private readonly secretService: AiSecretService,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.providerRepository.count();
    if (count > 0) {
      return;
    }
    const rows = SUPPORTED_KEYS.map((key) =>
      this.providerRepository.create({
        providerKey: key,
        baseUrl: null,
        apiKeyCipher: null,
        isActive: key === 'deepseek',
      }),
    );
    await this.providerRepository.save(rows);
  }

  async list(): Promise<ProviderView[]> {
    const rows = await this.providerRepository.find({
      order: { id: 'ASC' },
    });
    const byKey = new Map(rows.map((row) => [row.providerKey, row]));
    const result: ProviderView[] = [];
    for (const key of SUPPORTED_KEYS) {
      const row = byKey.get(key);
      if (!row) {
        continue;
      }
      const plain = row.apiKeyCipher
        ? this.secretService.decrypt(row.apiKeyCipher)
        : null;
      result.push({
        key: row.providerKey,
        baseUrl: row.baseUrl,
        hasKey: row.apiKeyCipher !== null && row.apiKeyCipher.length > 0,
        maskedKey: plain ? maskApiKey(plain) : null,
        active: row.isActive,
        capabilities: PROVIDER_CAPABILITIES[row.providerKey] ?? [],
      });
    }
    return result;
  }

  async getActiveCredentials(): Promise<{
    key: string;
    baseUrl: string | null;
    apiKey: string | null;
  }> {
    const row = await this.providerRepository.findOne({
      where: { isActive: true },
    });
    if (!row) {
      return { key: '', baseUrl: null, apiKey: null };
    }
    const plain = row.apiKeyCipher
      ? this.secretService.decrypt(row.apiKeyCipher)
      : null;
    return {
      key: row.providerKey,
      baseUrl: row.baseUrl,
      apiKey: plain,
    };
  }

  async save(inputs: ProviderInput[]): Promise<ProviderView[]> {
    if (inputs.length === 0) {
      throw new BadRequestException('配置项不能为空');
    }
    const keys = inputs.map((input) => input.key.trim());
    for (const key of keys) {
      if (!SUPPORTED_KEYS.includes(key)) {
        throw new BadRequestException(`不支持的提供方：${key}`);
      }
    }
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('配置项重复');
    }
    const existing = await this.providerRepository.find({
      where: { providerKey: In(keys) },
    });
    const existingByKey = new Map(
      existing.map((row) => [row.providerKey, row]),
    );
    const pendingActiveKey = inputs.find((input) => input.active === true)?.key;

    for (const input of inputs) {
      const normalizedKey = input.key.trim();
      const baseUrl = input.baseUrl?.trim() ?? null;
      if (baseUrl !== null && baseUrl.length > 500) {
        throw new BadRequestException('服务地址过长');
      }
      if (input.apiKey !== undefined && input.apiKey.length > 2000) {
        throw new BadRequestException('API 密钥过长');
      }
      let row = existingByKey.get(normalizedKey);
      if (!row) {
        row = this.providerRepository.create({
          providerKey: normalizedKey,
          baseUrl: null,
          apiKeyCipher: null,
          isActive: false,
        });
      }
      if (input.baseUrl !== undefined) {
        row.baseUrl = baseUrl && baseUrl.length > 0 ? baseUrl : null;
      }
      const apiKey = input.apiKey?.trim();
      if (apiKey !== undefined && apiKey !== null) {
        row.apiKeyCipher =
          apiKey.length > 0 ? this.secretService.encrypt(apiKey) : null;
      }
      if (pendingActiveKey) {
        row.isActive = row.providerKey === pendingActiveKey;
      } else if (input.active === false) {
        row.isActive = false;
      }
      await this.providerRepository.save(row);
    }
    if (pendingActiveKey) {
      const otherKeys = SUPPORTED_KEYS.filter(
        (key) => !keys.includes(key) || key !== pendingActiveKey,
      );
      if (otherKeys.length > 0) {
        await this.providerRepository.update(
          { providerKey: In(otherKeys), isActive: true },
          { isActive: false },
        );
      }
    }
    return this.list();
  }

  async test(input: TestProviderInput): Promise<TestResult> {
    const normalizedKey = input.key.trim();
    if (!SUPPORTED_KEYS.includes(normalizedKey)) {
      throw new BadRequestException(`不支持的提供方：${normalizedKey}`);
    }
    const row = await this.providerRepository.findOne({
      where: { providerKey: normalizedKey },
    });
    const baseUrl = (input.baseUrl?.trim() || row?.baseUrl || '').trim();
    const apiKey = (() => {
      const raw = input.apiKey?.trim();
      if (raw) {
        return raw;
      }
      if (row?.apiKeyCipher) {
        return this.secretService.decrypt(row.apiKeyCipher);
      }
      return '';
    })();
    if (!baseUrl) {
      return {
        ok: false,
        code: 'not_configured',
        detail: '服务地址未配置',
      };
    }
    if (!apiKey) {
      return {
        ok: false,
        code: 'not_configured',
        detail: 'API 密钥未配置',
      };
    }

    const probeUrl = this.buildProbeUrl(normalizedKey, baseUrl);
    const headers: Record<string, string> = {};
    if (normalizedKey === 'gemini') {
      headers['x-goog-api-key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const started = Date.now();
      const response = await fetch(probeUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      const latency = Date.now() - started;
      if (response.ok) {
        return { ok: true, code: 'success', status: response.status, detail: `${latency}ms` };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          code: 'unauthorized',
          status: response.status,
          detail: 'API 密钥校验失败',
        };
      }
      return {
        ok: false,
        code: 'http_error',
        status: response.status,
        detail: `服务返回 HTTP ${response.status}`,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? '连接超时'
          : '无法连接服务商';
      return { ok: false, code: 'unreachable', detail: message };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildProbeUrl(key: string, baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');
    if (key === 'gemini') {
      return `${trimmed}/models?alt=json`;
    }
    return `${trimmed}/models`;
  }
}
