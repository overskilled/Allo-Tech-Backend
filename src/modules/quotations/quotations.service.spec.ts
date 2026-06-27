// expo-server-sdk is ESM-only and is pulled in transitively via
// NotificationsService at import time. Mock it so the service graph loads under
// ts-jest (it is never exercised by these tests).
jest.mock('expo-server-sdk', () => {
  class Expo {
    static isExpoPushToken() {
      return true;
    }
    chunkPushNotifications() {
      return [];
    }
    sendPushNotificationsAsync() {
      return Promise.resolve([]);
    }
  }
  return { __esModule: true, default: Expo, Expo };
});

import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MissionsService } from '../missions/missions.service';
import { MailService } from '../mail/mail.service';
import { PawaPayService } from '../payments/providers/pawapay.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * Endpoint-logic tests for the money rules wired in Sprint 2:
 *  - the 5 000 XAF labour floor blocks quotation (→ mission) creation,
 *  - a valid quotation persists the chosen payment scope.
 * Prisma is mocked so these run with no database.
 */
describe('QuotationsService — money rules', () => {
  let service: QuotationsService;
  let prisma: any;

  const TECH_ID = 'tech-1';
  const NEED_ID = 'need-1';

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      need: { findUnique: jest.fn() },
      quotation: { findFirst: jest.fn(), create: jest.fn() },
      quotationImage: { createMany: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuotationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MissionsService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: PawaPayService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: AnalyticsService, useValue: { track: jest.fn(), identify: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(QuotationsService);

    // Happy-path lookups: a technician with an accepted candidature, no existing devis.
    prisma.user.findUnique.mockResolvedValue({ id: TECH_ID, role: 'TECHNICIAN', technicianProfile: { id: 'tp-1' } });
    prisma.need.findUnique.mockResolvedValue({ id: NEED_ID, candidatures: [{ technicianId: TECH_ID, status: 'ACCEPTED' }] });
    prisma.quotation.findFirst.mockResolvedValue(null);
    prisma.quotationImage.createMany.mockResolvedValue({ count: 0 });
  });

  const baseDto = {
    needId: NEED_ID,
    stateOfWork: 'Fuite sous évier',
    urgencyLevel: 'NORMAL' as const,
    proposedSolution: 'Remplacer le siphon',
    materials: [{ name: 'Siphon', quantity: 1, unitPrice: 3000, totalPrice: 3000 } as any],
  };

  it('rejects a quotation whose labour is below 5 000 XAF', async () => {
    await expect(
      service.createQuotation(TECH_ID, { ...baseDto, laborCost: 4000 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('creates a quotation at/above 5 000 XAF and persists the payment scope', async () => {
    prisma.quotation.create.mockImplementation(async ({ data }: any) => ({
      id: 'q-1',
      ...data,
      need: { id: NEED_ID, title: 'Fuite', client: { id: 'c-1', firstName: 'A', lastName: 'B' } },
    }));

    const result = await service.createQuotation(TECH_ID, {
      ...baseDto,
      laborCost: 50_000,
      paymentScope: 'LABOR_ONLY',
    } as any);

    expect(prisma.quotation.create).toHaveBeenCalledTimes(1);
    const created = prisma.quotation.create.mock.calls[0][0].data;
    expect(created.laborCost).toBe(50_000);
    expect(created.paymentScope).toBe('LABOR_ONLY');
    // totalCost is still the full devis value (labour + materials)
    expect(Number(result.totalCost)).toBe(53_000);
  });

  it('defaults payment scope to FULL when not provided', async () => {
    prisma.quotation.create.mockImplementation(async ({ data }: any) => ({
      id: 'q-2',
      ...data,
      need: { id: NEED_ID, title: 'Fuite', client: { id: 'c-1', firstName: 'A', lastName: 'B' } },
    }));

    await service.createQuotation(TECH_ID, { ...baseDto, laborCost: 9000 } as any);
    const created = prisma.quotation.create.mock.calls[0][0].data;
    expect(created.paymentScope).toBe('FULL');
  });
});
