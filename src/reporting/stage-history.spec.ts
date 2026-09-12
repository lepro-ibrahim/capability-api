import { ReportingService } from './reporting.service';

describe('reporting stage history', () => {
  it('retains funnel entries after a prospect moves to WON and preserves filters', async () => {
    const prisma = {
      stageEvent: { count: jest.fn().mockResolvedValue(3) },
      lead: { count: jest.fn().mockResolvedValue(1) },
      stage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReportingService(prisma as any);
    expect(await service.pipelineMetrics({
      keys: ['CALL_REQUESTED'], from: '2026-09-07', to: '2026-09-12',
      sourcesCsv: 'DEMO · Meta Ads', tagsCsv: 'DEMO',
    })).toEqual({ CALL_REQUESTED: 3 });
    expect(prisma.stageEvent.count).toHaveBeenCalledWith({ where: {
      toStage: { in: ['CALL_REQUESTED'] },
      occurredAt: { gte: expect.any(Date), lte: expect.any(Date) },
      lead: { AND: [{ source: { in: ['DEMO · Meta Ads'] } }, { tag: { in: ['DEMO'] } }] },
    } });
    expect(prisma.lead.count).not.toHaveBeenCalled();
    expect(await service.pipelineMetrics({ keys: ['CALL_REQUESTED'], mode: 'current' }))
      .toEqual({ CALL_REQUESTED: 1 });
  });

  it('uses the same historical entries for call totals without a date window', async () => {
    const prisma = { stageEvent: { count: jest.fn().mockResolvedValue(8) } };
    const service = new ReportingService(prisma as any);
    expect(await service.metricCalls()).toEqual({ total: 8, byDay: [] });
    expect(prisma.stageEvent.count).toHaveBeenCalledWith({ where: {
      toStage: { in: ['CALL_ATTEMPT'] }, lead: {},
    } });
  });
});
