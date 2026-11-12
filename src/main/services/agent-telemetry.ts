import { createServer, type Server } from 'http';
import type { AgentActivity } from '../../shared/types';

export interface AgentTelemetryUpdate {
  sessionId?: string;
  accountKey?: string;
  accountLabel?: string;
  model?: string;
  activity?: Omit<AgentActivity, 'id' | 'at'>;
  usageDelta?: Partial<Record<'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'reasoningTokens' | 'costUsd', number>>;
}

export interface ClaudeTelemetryReceiver {
  endpoint: string;
  close: () => Promise<void>;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function attributeValue(value: unknown): string | number | boolean | undefined {
  const record = asRecord(value);
  if (record == null) return undefined;
  for (const key of ['stringValue', 'intValue', 'doubleValue', 'boolValue']) {
    const entry = record[key];
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') return entry;
  }
  return undefined;
}

function readAttributes(value: unknown): Record<string, string | number | boolean> {
  const rows = Array.isArray(value) ? value : [];
  const result: Record<string, string | number | boolean> = {};
  for (const item of rows) {
    const row = asRecord(item);
    if (row == null || typeof row.key !== 'string') continue;
    const resolved = attributeValue(row.value);
    if (resolved != null) result[row.key] = resolved;
  }
  return result;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function accountData(attributes: Record<string, string | number | boolean>): Pick<AgentTelemetryUpdate, 'accountKey' | 'accountLabel'> {
  const key = attributes['user.account_id'] ?? attributes['user.account_uuid'];
  if (key == null) return {};
  const accountKey = String(key).slice(0, 128);
  return { accountKey, accountLabel: `Claude Code · …${accountKey.slice(-6)}` };
}

function safeTelemetryName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const result = value.replace(/[\r\n\t]/g, ' ').trim().slice(0, 80);
  return result === '' ? fallback : result;
}

function normalizedEventName(attributes: Record<string, string | number | boolean>, fallback?: unknown): string {
  const raw = attributes['event.name'] ?? attributes['eventName'] ?? fallback;
  if (typeof raw !== 'string') return '';
  return raw.replace(/^claude_code\./, '').toLowerCase();
}

function activityForLog(attributes: Record<string, string | number | boolean>, eventName: string): AgentTelemetryUpdate['activity'] {
  const agentId = attributes.agent_id != null ? String(attributes.agent_id).slice(0, 200) : undefined;
  const parentAgentId = attributes.parent_agent_id != null ? String(attributes.parent_agent_id).slice(0, 200) : undefined;
  const agentType = attributes['agent.name'] != null ? safeTelemetryName(attributes['agent.name'], 'Subagent') : undefined;
  if (eventName === 'tool_result') {
    const tool = safeTelemetryName(attributes.tool_name, 'ferramenta');
    return { kind: 'tool', label: `Concluiu ${tool}`, status: attributes.success === 'false' ? 'error' : 'done', agentId, parentAgentId, agentType };
  }
  if (eventName === 'tool_decision') {
    const decision = String(attributes.decision ?? attributes.decision_type ?? '');
    const tool = safeTelemetryName(attributes.tool_name, 'ferramenta');
    return { kind: 'tool', label: decision === 'ask' ? `Aguardando autorização: ${tool}` : `Iniciou ${tool}`, status: decision === 'ask' ? 'waiting' : 'running', agentId, parentAgentId, agentType };
  }
  if (eventName === 'subagent_completed') {
    const name = safeTelemetryName(agentType ?? attributes.agent_type, 'Subagent');
    return { kind: 'subagent', label: `Concluiu subagent ${name}`.slice(0, 220), status: 'done', agentId, parentAgentId, agentType: name };
  }
  if (eventName === 'api_request' && agentId != null) {
    const name = safeTelemetryName(agentType, 'Subagent');
    return { kind: 'subagent', label: `Subagent ativo: ${name}`.slice(0, 220), status: 'running', agentId, parentAgentId, agentType: name };
  }
  if (eventName === 'api_request') {
    return { kind: 'status', label: 'Claude Code está consultando o modelo', status: 'running' };
  }
  if (eventName === 'api_error') {
    return { kind: 'status', label: 'Claude Code recebeu um erro do provedor', status: 'error' };
  }
  return undefined;
}

function visitOtlp(payload: JsonRecord, onUpdate: (update: AgentTelemetryUpdate) => void): void {
  const resourceLogs = Array.isArray(payload.resourceLogs) ? payload.resourceLogs : [];
  for (const rawResource of resourceLogs) {
    const resource = asRecord(rawResource);
    if (resource == null) continue;
    const resourceAttributes = readAttributes(asRecord(resource.resource)?.attributes);
    const scopes = Array.isArray(resource.scopeLogs) ? resource.scopeLogs : [];
    for (const rawScope of scopes) {
      const records = Array.isArray(asRecord(rawScope)?.logRecords) ? asRecord(rawScope)?.logRecords as unknown[] : [];
      for (const rawRecord of records) {
        const record = asRecord(rawRecord);
        if (record == null) continue;
        const attributes = { ...resourceAttributes, ...readAttributes(record.attributes) };
        const eventName = normalizedEventName(attributes, record.eventName);
        const update: AgentTelemetryUpdate = {
          ...(typeof attributes['session.id'] === 'string' ? { sessionId: attributes['session.id'].slice(0, 200) } : {}),
          ...accountData(attributes),
          ...(typeof attributes.model === 'string' ? { model: attributes.model } : {})
        };
        const activity = activityForLog(attributes, eventName);
        if (activity != null) update.activity = activity;
        if (Object.keys(update).length > 0) onUpdate(update);
      }
    }
  }

  const resourceMetrics = Array.isArray(payload.resourceMetrics) ? payload.resourceMetrics : [];
  for (const rawResource of resourceMetrics) {
    const resource = asRecord(rawResource);
    if (resource == null) continue;
    const resourceAttributes = readAttributes(asRecord(resource.resource)?.attributes);
    const scopes = Array.isArray(resource.scopeMetrics) ? resource.scopeMetrics : [];
    for (const rawScope of scopes) {
      const metrics = Array.isArray(asRecord(rawScope)?.metrics) ? asRecord(rawScope)?.metrics as unknown[] : [];
      for (const rawMetric of metrics) {
        const metric = asRecord(rawMetric);
        if (metric == null || typeof metric.name !== 'string') continue;
        const metricData = asRecord(metric.sum) ?? asRecord(metric.gauge) ?? asRecord(metric.histogram);
        if (metricData == null) continue;
        const points = Array.isArray(metricData.dataPoints) ? metricData.dataPoints : [];
        const temporality = metricData.aggregationTemporality;
        for (const rawPoint of points) {
          const point = asRecord(rawPoint);
          if (point == null) continue;
          const attributes = { ...resourceAttributes, ...readAttributes(point.attributes) };
          const value = numberValue(point.asInt ?? point.asDouble ?? point.value);
          if (value == null) continue;
          const type = String(attributes.type ?? '');
          const deltaKey = metric.name === 'claude_code.cost.usage' ? 'costUsd' : type === 'input' ? 'inputTokens' : type === 'output' ? 'outputTokens' : type === 'cacheRead' ? 'cacheReadTokens' : type === 'cacheCreation' ? 'cacheWriteTokens' : undefined;
          if (deltaKey == null) continue;
          const start = String(point.startTimeUnixNano ?? '');
          const key = [metric.name, attributes['session.id'], attributes.model, attributes.query_source, attributes['agent.name'], type, start].join('|');
          onUpdate({
            ...(typeof attributes['session.id'] === 'string' ? { sessionId: attributes['session.id'].slice(0, 200) } : {}),
            ...accountData(attributes),
            ...(typeof attributes.model === 'string' ? { model: attributes.model } : {}),
            usageDelta: { [deltaKey]: value },
            metricKey: key,
            metricValue: value,
            cumulativeMetric: temporality === 2
          } as AgentTelemetryUpdate);
        }
      }
    }
  }
}

export async function startClaudeTelemetryReceiver(onUpdate: (update: AgentTelemetryUpdate) => void): Promise<ClaudeTelemetryReceiver> {
  const cumulativeValues = new Map<string, number>();
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    let byteLength = 0;
    request.on('data', (chunk: Buffer) => {
      byteLength += chunk.length;
      if (byteLength <= 1_000_000) chunks.push(chunk);
    });
    request.on('end', () => {
      response.statusCode = byteLength <= 1_000_000 ? 200 : 413;
      response.setHeader('content-type', 'application/json');
      response.end('{"partialSuccess":{}}');
      if (byteLength > 1_000_000) return;
      try {
        const payload = asRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
        if (payload == null) return;
        visitOtlp(payload, (update) => {
          const extended = update as AgentTelemetryUpdate & { metricKey?: string; metricValue?: number; cumulativeMetric?: boolean };
          if (extended.metricKey != null && extended.metricValue != null && extended.usageDelta != null) {
            let delta = extended.metricValue;
            if (extended.cumulativeMetric) {
              const previous = cumulativeValues.get(extended.metricKey) ?? 0;
              delta = Math.max(0, extended.metricValue - previous);
              cumulativeValues.set(extended.metricKey, extended.metricValue);
            }
            const field = Object.keys(extended.usageDelta)[0] as keyof NonNullable<AgentTelemetryUpdate['usageDelta']>;
            if (field != null) extended.usageDelta[field] = delta;
            delete extended.metricKey;
            delete extended.metricValue;
            delete extended.cumulativeMetric;
          }
          onUpdate(extended);
        });
      } catch {
        // Ignore malformed or unsupported telemetry without interrupting the CLI.
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address == null || typeof address === 'string') throw new Error('Não foi possível abrir o receptor local de telemetria');
  server.unref();
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}
