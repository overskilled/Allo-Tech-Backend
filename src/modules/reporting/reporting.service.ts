import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DateRangeDto,
  ReportPeriod,
  TechnicianReportQueryDto,
  ClientReportQueryDto,
  ExportFormat,
} from './dto/reporting.dto';

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // DATE RANGE HELPERS
  // ==========================================

  private getDateRange(query: DateRangeDto): { start: Date; end: Date } {
    const now = new Date();
    let start: Date;
    let end: Date = new Date(now);

    if (query.period === ReportPeriod.CUSTOM && query.startDate && query.endDate) {
      start = new Date(query.startDate);
      end = new Date(query.endDate);
    } else {
      switch (query.period) {
        case ReportPeriod.TODAY:
          start = new Date(now.setHours(0, 0, 0, 0));
          break;
        case ReportPeriod.WEEK:
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          break;
        case ReportPeriod.QUARTER:
          start = new Date(now);
          start.setMonth(start.getMonth() - 3);
          break;
        case ReportPeriod.YEAR:
          start = new Date(now);
          start.setFullYear(start.getFullYear() - 1);
          break;
        case ReportPeriod.MONTH:
        default:
          start = new Date(now);
          start.setMonth(start.getMonth() - 1);
          break;
      }
    }

    return { start, end };
  }

  // ==========================================
  // CLIENT STATISTICS
  // ==========================================

  async getClientStatistics(query: ClientReportQueryDto) {
    const { start, end } = this.getDateRange(query);

    const [
      totalClients,
      newClients,
      activeClients,
      clientsByCity,
      needsCreated,
      needsCompleted,
      avgNeedsPerClient,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
      this.prisma.user.count({
        where: {
          role: 'CLIENT',
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.user.count({
        where: {
          role: 'CLIENT',
          status: 'ACTIVE',
          lastLoginAt: { gte: start },
        },
      }),
      this.prisma.clientProfile.groupBy({
        by: ['city'],
        where: { city: { not: null } },
        _count: { city: true },
      }),
      this.prisma.need.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      this.prisma.need.count({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: start, lte: end },
        },
      }),
      this.getAvgNeedsPerClient(),
    ]);

    // Daily signups
    const dailySignups = await this.getDailySignups(start, end, 'CLIENT');

    return {
      period: { start, end },
      summary: {
        totalClients,
        newClients,
        activeClients,
        needsCreated,
        needsCompleted,
        avgNeedsPerClient,
      },
      byCity: clientsByCity.map((c) => ({
        city: c.city || 'Non spécifié',
        count: c._count.city,
      })),
      dailySignups,
    };
  }

  private async getAvgNeedsPerClient(): Promise<number> {
    const result = await this.prisma.need.groupBy({
      by: ['clientId'],
      _count: { id: true },
    });

    if (result.length === 0) return 0;
    const total = result.reduce((sum, r) => sum + r._count.id, 0);
    return Math.round((total / result.length) * 10) / 10;
  }

  // ==========================================
  // TECHNICIAN STATISTICS
  // ==========================================

  async getTechnicianStatistics(query: TechnicianReportQueryDto) {
    const { start, end } = this.getDateRange(query);

    const where: any = { role: 'TECHNICIAN' };

    const [
      totalTechnicians,
      newTechnicians,
      verifiedTechnicians,
      activeTechnicians,
      techniciansByCity,
      techniciansByProfession,
      topRatedTechnicians,
      avgRating,
      totalCompletedJobs,
    ] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({
        where: { ...where, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.technicianProfile.count({ where: { isVerified: true } }),
      this.prisma.user.count({
        where: { ...where, status: 'ACTIVE' },
      }),
      this.prisma.technicianProfile.groupBy({
        by: ['city'],
        where: { city: { not: null } },
        _count: { city: true },
      }),
      this.prisma.technicianProfile.groupBy({
        by: ['profession'],
        _count: { profession: true },
      }),
      this.getTopRatedTechnicians(5),
      this.prisma.technicianProfile.aggregate({
        _avg: { avgRating: true },
      }),
      this.prisma.technicianProfile.aggregate({
        _sum: { completedJobs: true },
      }),
    ]);

    // Daily signups
    const dailySignups = await this.getDailySignups(start, end, 'TECHNICIAN');

    return {
      period: { start, end },
      summary: {
        totalTechnicians,
        newTechnicians,
        verifiedTechnicians,
        activeTechnicians,
        verificationRate:
          totalTechnicians > 0 ? Math.round((verifiedTechnicians / totalTechnicians) * 100) : 0,
        avgRating: avgRating._avg.avgRating || 0,
        totalCompletedJobs: totalCompletedJobs._sum.completedJobs || 0,
      },
      byCity: techniciansByCity.map((c) => ({
        city: c.city || 'Non spécifié',
        count: c._count.city,
      })),
      byProfession: techniciansByProfession.map((p) => ({
        profession: p.profession,
        count: p._count.profession,
      })),
      topRated: topRatedTechnicians,
      dailySignups,
    };
  }

  private async getTopRatedTechnicians(limit: number) {
    return this.prisma.user.findMany({
      where: {
        role: 'TECHNICIAN',
        technicianProfile: {
          isVerified: true,
          totalRatings: { gte: 5 },
        },
      },
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        technicianProfile: {
          select: {
            profession: true,
            avgRating: true,
            totalRatings: true,
            completedJobs: true,
          },
        },
      },
      orderBy: {
        technicianProfile: {
          avgRating: 'desc',
        },
      },
    });
  }

  // ==========================================
  // REVENUE REPORTS
  // ==========================================

  async getRevenueReport(query: DateRangeDto) {
    const { start, end } = this.getDateRange(query);

    const [
      totalRevenue,
      transactionCount,
      revenueByMethod,
      revenueByPurpose,
      dailyRevenue,
      avgTransactionValue,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
          paidAt: { gte: start, lte: end },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({
        where: {
          status: 'COMPLETED',
          paidAt: { gte: start, lte: end },
        },
      }),
      this.getRevenueByPaymentMethod(start, end),
      this.getRevenueByPurpose(start, end),
      this.getDailyRevenue(start, end),
      this.prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
          paidAt: { gte: start, lte: end },
        },
        _avg: { amount: true },
      }),
    ]);

    // Compare with previous period
    const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - periodDays);

    const prevRevenue = await this.prisma.payment.aggregate({
      where: {
        status: 'COMPLETED',
        paidAt: { gte: prevStart, lt: start },
      },
      _sum: { amount: true },
    });

    const currentTotal = Number(totalRevenue._sum.amount || 0);
    const previousTotal = Number(prevRevenue._sum.amount || 0);
    const growthRate =
      previousTotal > 0 ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100) : 0;

    return {
      period: { start, end },
      summary: {
        totalRevenue: currentTotal,
        transactionCount,
        avgTransactionValue: avgTransactionValue._avg.amount || 0,
        growthRate,
        previousPeriodRevenue: previousTotal,
      },
      byPaymentMethod: revenueByMethod,
      dailyRevenue,
    };
  }

  private async getRevenueByPaymentMethod(start: Date, end: Date) {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'COMPLETED',
        paidAt: { gte: start, lte: end },
      },
      select: {
        amount: true,
        paymentMethod: true,
      },
    });

    const byMethod: Record<string, number> = {};
    payments.forEach((p) => {
      const method = p.paymentMethod || 'unknown';
      byMethod[method] = (byMethod[method] || 0) + Number(p.amount);
    });

    return Object.entries(byMethod).map(([method, amount]) => ({
      method,
      amount,
      percentage:
        payments.length > 0
          ? Math.round((amount / payments.reduce((s, p) => s + Number(p.amount), 0)) * 100)
          : 0,
    }));
  }

  private async getRevenueByPurpose(start: Date, end: Date) {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'COMPLETED',
        paidAt: { gte: start, lte: end },
      },
      select: {
        amount: true,
        paymentDetails: true,
      },
    });

    const byPurpose: Record<string, number> = {};
    payments.forEach((p) => {
      let purpose = 'other';
      if (p.paymentDetails) {
        try {
          const details = JSON.parse(p.paymentDetails as string);
          purpose = details.purpose || 'other';
        } catch {}
      }
      byPurpose[purpose] = (byPurpose[purpose] || 0) + Number(p.amount);
    });

    return Object.entries(byPurpose).map(([purpose, amount]) => ({
      purpose,
      amount,
    }));
  }

  private async getDailyRevenue(start: Date, end: Date) {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'COMPLETED',
        paidAt: { gte: start, lte: end },
      },
      select: {
        amount: true,
        paidAt: true,
      },
    });

    const daily: Record<string, number> = {};
    payments.forEach((p) => {
      if (p.paidAt) {
        const date = p.paidAt.toISOString().split('T')[0];
        daily[date] = (daily[date] || 0) + Number(p.amount);
      }
    });

    return Object.entries(daily)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // ==========================================
  // USAGE ANALYTICS
  // ==========================================

  async getUsageAnalytics(query: DateRangeDto) {
    const { start, end } = this.getDateRange(query);

    const [needsStats, appointmentStats, quotationStats, messageStats, ratingStats] =
      await Promise.all([
        this.getNeedsAnalytics(start, end),
        this.getAppointmentAnalytics(start, end),
        this.getQuotationAnalytics(start, end),
        this.getMessageAnalytics(start, end),
        this.getRatingAnalytics(start, end),
      ]);

    return {
      period: { start, end },
      needs: needsStats,
      appointments: appointmentStats,
      quotations: quotationStats,
      messaging: messageStats,
      ratings: ratingStats,
    };
  }

  private async getNeedsAnalytics(start: Date, end: Date) {
    const [total, byStatus, byCategory, byUrgency] = await Promise.all([
      this.prisma.need.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      this.prisma.need.groupBy({
        by: ['status'],
        where: { createdAt: { gte: start, lte: end } },
        _count: { status: true },
      }),
      this.prisma.need.groupBy({
        by: ['categoryId'],
        where: { createdAt: { gte: start, lte: end } },
        _count: { categoryId: true },
      }),
      this.prisma.need.groupBy({
        by: ['urgency'],
        where: { createdAt: { gte: start, lte: end } },
        _count: { urgency: true },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.status })),
      byUrgency: byUrgency.map((u) => ({ urgency: u.urgency, count: u._count.urgency })),
    };
  }

  private async getAppointmentAnalytics(start: Date, end: Date) {
    const [total, byStatus, completionRate] = await Promise.all([
      this.prisma.appointment.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { createdAt: { gte: start, lte: end } },
        _count: { status: true },
      }),
      this.prisma.appointment.count({
        where: {
          createdAt: { gte: start, lte: end },
          status: 'COMPLETED',
        },
      }),
    ]);

    return {
      total,
      completed: completionRate,
      completionRate: total > 0 ? Math.round((completionRate / total) * 100) : 0,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.status })),
    };
  }

  private async getQuotationAnalytics(start: Date, end: Date) {
    const [total, byStatus, avgValue] = await Promise.all([
      this.prisma.quotation.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      this.prisma.quotation.groupBy({
        by: ['status'],
        where: { createdAt: { gte: start, lte: end } },
        _count: { status: true },
      }),
      this.prisma.quotation.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _avg: { totalCost: true },
      }),
    ]);

    const accepted = byStatus.find((s) => s.status === 'ACCEPTED')?._count.status || 0;

    return {
      total,
      accepted,
      acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
      avgValue: avgValue._avg.totalCost || 0,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.status })),
    };
  }

  private async getMessageAnalytics(start: Date, end: Date) {
    const [totalMessages, activeConversations] = await Promise.all([
      this.prisma.message.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      this.prisma.conversation.count({
        where: { lastMessageAt: { gte: start, lte: end } },
      }),
    ]);

    return {
      totalMessages,
      activeConversations,
      avgMessagesPerConversation:
        activeConversations > 0 ? Math.round(totalMessages / activeConversations) : 0,
    };
  }

  private async getRatingAnalytics(start: Date, end: Date) {
    const [total, avgScore, distribution] = await Promise.all([
      this.prisma.rating.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      this.prisma.rating.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _avg: { score: true },
      }),
      this.prisma.rating.groupBy({
        by: ['score'],
        where: { createdAt: { gte: start, lte: end } },
        _count: { score: true },
      }),
    ]);

    return {
      total,
      avgScore: avgScore._avg.score || 0,
      distribution: distribution.map((d) => ({ score: d.score, count: d._count.score })),
    };
  }

  // ==========================================
  // EXPORT REPORTS
  // ==========================================

  async exportReport(
    reportType: string,
    query: DateRangeDto,
    format: ExportFormat = ExportFormat.CSV
  ) {
    let data: any;

    switch (reportType) {
      case 'clients':
        data = await this.getClientStatistics(query);
        break;
      case 'technicians':
        data = await this.getTechnicianStatistics(query);
        break;
      case 'revenue':
        data = await this.getRevenueReport(query);
        break;
      case 'usage':
        data = await this.getUsageAnalytics(query);
        break;
      default:
        throw new Error('Invalid report type');
    }

    if (format === ExportFormat.JSON) {
      return { data, format: 'json' };
    }

    if (format === ExportFormat.CSV) {
      return {
        data: this.convertToCSV(data),
        format: 'csv',
        filename: `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`,
      };
    }

    // PDF would require additional library like pdfkit
    return { data, format: 'json' };
  }

  private convertToCSV(data: any): string {
    const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
      return Object.keys(obj).reduce((acc: Record<string, any>, k) => {
        const pre = prefix.length ? `${prefix}_` : '';
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
          Object.assign(acc, flattenObject(obj[k], pre + k));
        } else {
          acc[pre + k] = Array.isArray(obj[k]) ? JSON.stringify(obj[k]) : obj[k];
        }
        return acc;
      }, {});
    };

    const flat = flattenObject(data);
    const headers = Object.keys(flat).join(',');
    const values = Object.values(flat)
      .map((v) => (typeof v === 'string' ? `"${v}"` : v))
      .join(',');

    return `${headers}\n${values}`;
  }

  // ==========================================
  // HELPER: DAILY SIGNUPS
  // ==========================================

  private async getDailySignups(start: Date, end: Date, role: any) {
    const users = await this.prisma.user.findMany({
      where: {
        role: role,
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true },
    });

    const daily: Record<string, number> = {};
    users.forEach((u) => {
      const date = u.createdAt.toISOString().split('T')[0];
      daily[date] = (daily[date] || 0) + 1;
    });

    return Object.entries(daily)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
