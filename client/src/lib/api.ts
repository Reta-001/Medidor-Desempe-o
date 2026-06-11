import type { EventPayload, MetricsSnapshot, Period, Subsystem, PeriodSummary } from "../types/domain";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  async getSubsystems(): Promise<Subsystem[]> {
    const data = await request<{ subsystems: Subsystem[] }>("/subsystems");
    return data.subsystems;
  },

  async getCurrentPeriod(): Promise<Period | null> {
    const data = await request<{ period: Period | null }>("/periods/current");
    return data.period;
  },

  async startPeriod(): Promise<Period> {
    const data = await request<{ period: Period }>("/periods/start", {
      method: "POST",
      body: JSON.stringify({})
    });
    return data.period;
  },

  async stopPeriod(): Promise<MetricsSnapshot & { exports: Record<string, string> }> {
    return request<MetricsSnapshot & { exports: Record<string, string> }>("/periods/stop", {
      method: "POST",
      body: JSON.stringify({})
    });
  },

  async recordEvent(payload: EventPayload): Promise<void> {
    await request("/events", {
      method: "POST",
      body: JSON.stringify(payload),
      keepalive: true
    });
  },

  async recordEventsBatch(events: EventPayload[]): Promise<void> {
    await request("/events/batch", {
      method: "POST",
      body: JSON.stringify({ events }),
      keepalive: true
    });
  },

  async getCurrentMetrics(): Promise<MetricsSnapshot> {
    return request<MetricsSnapshot>("/metrics/current");
  },

  async deleteSubsystemEvents(subsystemId: string): Promise<{ deleted: number; subsystemId: string; periodId: string }> {
    return request<{ deleted: number; subsystemId: string; periodId: string }>(
      `/subsystems/${encodeURIComponent(subsystemId)}/events/current`,
      { method: "DELETE" }
    );
  },

  async getPeriods(): Promise<PeriodSummary[]> {
    const data = await request<{ periods: PeriodSummary[] }>("/periods");
    return data.periods;
  },

  async deletePeriod(periodId: string): Promise<{ deleted: boolean; periodId: string }> {
    return request<{ deleted: boolean; periodId: string }>(`/periods/${encodeURIComponent(periodId)}`, {
      method: "DELETE"
    });
  }
};