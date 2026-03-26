import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import {
  CreateFieldVisitDto,
  UpdateFieldVisitDto,
  QueryFieldVisitsDto,
  CreateOnboardingDto,
  UpdateOnboardingDto,
  QueryOnboardingsDto,
} from './dto/agents.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // FIELD VISITS
  // ==========================================

  async getFieldVisits(agentId: string, query: QueryFieldVisitsDto) {
    const where: any = { agentId };

    if (query.status) where.status = query.status;
    if (query.outcome) where.outcome = query.outcome;
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.zone) where.zone = { contains: query.zone, mode: 'insensitive' };

    if (query.search) {
      where.OR = [
        { address: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { neighborhood: { contains: query.search, mode: 'insensitive' } },
        { zone: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.dateFrom || query.dateTo) {
      where.scheduledAt = {};
      if (query.dateFrom) where.scheduledAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.scheduledAt.lte = new Date(query.dateTo);
    }

    // Build orderBy
    let orderBy: any = { scheduledAt: 'desc' };
    if (query.sortBy) {
      orderBy = { [query.sortBy]: query.sortOrder || 'desc' };
    }

    const [visits, total] = await Promise.all([
      this.prisma.fieldVisit.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          onboardings: {
            select: { id: true, status: true, technicianName: true, profession: true },
          },
        },
      }),
      this.prisma.fieldVisit.count({ where }),
    ]);

    return createPaginatedResult(visits, total, query);
  }

  async getFieldVisit(agentId: string, visitId: string) {
    const visit = await this.prisma.fieldVisit.findUnique({
      where: { id: visitId },
      include: {
        onboardings: true,
      },
    });

    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.agentId !== agentId) throw new ForbiddenException('Access denied');

    return visit;
  }

  async createFieldVisit(agentId: string, dto: CreateFieldVisitDto) {
    return this.prisma.fieldVisit.create({
      data: {
        agentId,
        address: dto.address,
        city: dto.city,
        neighborhood: dto.neighborhood,
        latitude: dto.latitude,
        longitude: dto.longitude,
        zone: dto.zone,
        routeOrder: dto.routeOrder,
        notes: dto.notes,
        scheduledAt: new Date(dto.scheduledAt),
      },
    });
  }

  async updateFieldVisit(agentId: string, visitId: string, dto: UpdateFieldVisitDto) {
    const visit = await this.prisma.fieldVisit.findUnique({
      where: { id: visitId },
    });

    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.agentId !== agentId) throw new ForbiddenException('Access denied');

    const updateData: any = {};

    if (dto.status !== undefined) {
      updateData.status = dto.status;

      // Auto-set timestamps based on status changes
      if (dto.status === 'IN_PROGRESS' && !visit.startedAt) {
        updateData.startedAt = new Date();
      }
      if (dto.status === 'COMPLETED') {
        updateData.completedAt = new Date();
      }
    }

    if (dto.outcome !== undefined) updateData.outcome = dto.outcome;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.scheduledAt !== undefined) updateData.scheduledAt = new Date(dto.scheduledAt);
    if (dto.zone !== undefined) updateData.zone = dto.zone;
    if (dto.routeOrder !== undefined) updateData.routeOrder = dto.routeOrder;

    // GPS check-in
    if (dto.checkinLat !== undefined && dto.checkinLng !== undefined) {
      updateData.checkinLat = dto.checkinLat;
      updateData.checkinLng = dto.checkinLng;
      updateData.checkinAt = new Date();
    }

    // GPS check-out
    if (dto.checkoutLat !== undefined && dto.checkoutLng !== undefined) {
      updateData.checkoutLat = dto.checkoutLat;
      updateData.checkoutLng = dto.checkoutLng;
      updateData.checkoutAt = new Date();
    }

    return this.prisma.fieldVisit.update({
      where: { id: visitId },
      data: updateData,
      include: {
        onboardings: {
          select: { id: true, status: true },
        },
      },
    });
  }

  async deleteFieldVisit(agentId: string, visitId: string) {
    const visit = await this.prisma.fieldVisit.findUnique({
      where: { id: visitId },
    });

    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.agentId !== agentId) throw new ForbiddenException('Access denied');

    if (visit.status === 'COMPLETED') {
      throw new BadRequestException('Cannot delete a completed visit');
    }

    await this.prisma.fieldVisit.delete({ where: { id: visitId } });
    return { message: 'Visit deleted' };
  }

  // Batch update route order for zone planning
  async updateRouteOrder(agentId: string, updates: { id: string; routeOrder: number }[]) {
    const results = await Promise.all(
      updates.map(async (u) => {
        const visit = await this.prisma.fieldVisit.findUnique({ where: { id: u.id } });
        if (!visit || visit.agentId !== agentId) return null;
        return this.prisma.fieldVisit.update({
          where: { id: u.id },
          data: { routeOrder: u.routeOrder },
        });
      }),
    );
    return results.filter(Boolean);
  }

  // Get distinct zones for the agent
  async getAgentZones(agentId: string) {
    const visits = await this.prisma.fieldVisit.findMany({
      where: { agentId, zone: { not: null } },
      select: { zone: true, city: true },
      distinct: ['zone'],
    });
    return visits;
  }

  // ==========================================
  // ONBOARDING
  // ==========================================

  async getOnboardings(agentId: string, query: QueryOnboardingsDto) {
    const where: any = { agentId };

    if (query.status) where.status = query.status;
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };

    if (query.search) {
      where.OR = [
        { technicianName: { contains: query.search, mode: 'insensitive' } },
        { technicianPhone: { contains: query.search } },
        { technicianEmail: { contains: query.search, mode: 'insensitive' } },
        { profession: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.dateFrom || query.dateTo) {
      where.startedAt = {};
      if (query.dateFrom) where.startedAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.startedAt.lte = new Date(query.dateTo);
    }

    let orderBy: any = { createdAt: 'desc' };
    if (query.sortBy) {
      orderBy = { [query.sortBy]: query.sortOrder || 'desc' };
    }

    const [onboardings, total] = await Promise.all([
      this.prisma.technicianOnboarding.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          fieldVisit: {
            select: { id: true, scheduledAt: true, outcome: true },
          },
        },
      }),
      this.prisma.technicianOnboarding.count({ where }),
    ]);

    // Parse specialties and documents JSON
    const parsed = onboardings.map((ob) => ({
      ...ob,
      specialties: ob.specialties ? JSON.parse(ob.specialties) : [],
      documents: ob.documents ? JSON.parse(ob.documents) : [],
    }));

    return createPaginatedResult(parsed, total, query);
  }

  async getOnboarding(agentId: string, onboardingId: string) {
    const onboarding = await this.prisma.technicianOnboarding.findUnique({
      where: { id: onboardingId },
      include: {
        fieldVisit: true,
      },
    });

    if (!onboarding) throw new NotFoundException('Onboarding not found');
    if (onboarding.agentId !== agentId) throw new ForbiddenException('Access denied');

    return {
      ...onboarding,
      specialties: onboarding.specialties ? JSON.parse(onboarding.specialties) : [],
      documents: onboarding.documents ? JSON.parse(onboarding.documents) : [],
    };
  }

  async createOnboarding(agentId: string, dto: CreateOnboardingDto) {
    const data: any = {
      agentId,
      technicianName: dto.technicianName,
      technicianPhone: dto.technicianPhone,
      technicianEmail: dto.technicianEmail,
      profession: dto.profession,
      specialties: dto.specialties ? JSON.stringify(dto.specialties) : null,
      yearsExperience: dto.yearsExperience,
      city: dto.city,
      neighborhood: dto.neighborhood,
      address: dto.address,
      notes: dto.notes,
    };

    // If linked to a specific campaign, use it
    if (dto.fieldVisitId) {
      const visit = await this.prisma.fieldVisit.findUnique({
        where: { id: dto.fieldVisitId },
      });
      if (visit && visit.agentId === agentId) {
        data.fieldVisitId = dto.fieldVisitId;
      }
    } else {
      // Auto-assign to the currently active campaign (IN_PROGRESS) for this agent
      const activeCampaign = await this.prisma.fieldVisit.findFirst({
        where: { agentId, status: 'IN_PROGRESS' },
        orderBy: { startedAt: 'desc' },
      });
      if (activeCampaign) {
        data.fieldVisitId = activeCampaign.id;
      }
    }

    const onboarding = await this.prisma.technicianOnboarding.create({ data });

    return {
      ...onboarding,
      specialties: onboarding.specialties ? JSON.parse(onboarding.specialties) : [],
      documents: onboarding.documents ? JSON.parse(onboarding.documents) : [],
    };
  }

  async updateOnboarding(agentId: string, onboardingId: string, dto: UpdateOnboardingDto) {
    const onboarding = await this.prisma.technicianOnboarding.findUnique({
      where: { id: onboardingId },
    });

    if (!onboarding) throw new NotFoundException('Onboarding not found');
    if (onboarding.agentId !== agentId) throw new ForbiddenException('Access denied');

    const updateData: any = {};

    if (dto.status !== undefined) {
      updateData.status = dto.status;

      if (dto.status === 'COMPLETED') {
        updateData.completedAt = new Date();
      }
    }

    if (dto.technicianName !== undefined) updateData.technicianName = dto.technicianName;
    if (dto.technicianPhone !== undefined) updateData.technicianPhone = dto.technicianPhone;
    if (dto.technicianEmail !== undefined) updateData.technicianEmail = dto.technicianEmail;
    if (dto.profession !== undefined) updateData.profession = dto.profession;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.neighborhood !== undefined) updateData.neighborhood = dto.neighborhood;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.yearsExperience !== undefined) updateData.yearsExperience = dto.yearsExperience;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.rejectionReason !== undefined) updateData.rejectionReason = dto.rejectionReason;

    if (dto.specialties !== undefined) {
      updateData.specialties = JSON.stringify(dto.specialties);
    }

    if (dto.documents !== undefined) {
      updateData.documents = JSON.stringify(dto.documents);
    }

    const updated = await this.prisma.technicianOnboarding.update({
      where: { id: onboardingId },
      data: updateData,
      include: {
        fieldVisit: {
          select: { id: true, scheduledAt: true, outcome: true },
        },
      },
    });

    return {
      ...updated,
      specialties: updated.specialties ? JSON.parse(updated.specialties) : [],
      documents: updated.documents ? JSON.parse(updated.documents) : [],
    };
  }

  // ==========================================
  // AGENT STATS & PERFORMANCE
  // ==========================================

  async getAgentStats(agentId: string) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalVisits,
      completedVisits,
      totalOnboardings,
      completedOnboardings,
      weeklyVisits,
      weeklyOnboardings,
      monthlyVisits,
      monthlyOnboardings,
      pendingFollowUps,
      visitsByStatus,
      onboardingsByStatus,
      recentVisits,
    ] = await Promise.all([
      this.prisma.fieldVisit.count({ where: { agentId } }),
      this.prisma.fieldVisit.count({ where: { agentId, status: 'COMPLETED' } }),
      this.prisma.technicianOnboarding.count({ where: { agentId } }),
      this.prisma.technicianOnboarding.count({ where: { agentId, status: 'COMPLETED' } }),
      this.prisma.fieldVisit.count({ where: { agentId, scheduledAt: { gte: startOfWeek } } }),
      this.prisma.technicianOnboarding.count({ where: { agentId, createdAt: { gte: startOfWeek } } }),
      this.prisma.fieldVisit.count({ where: { agentId, scheduledAt: { gte: startOfMonth } } }),
      this.prisma.technicianOnboarding.count({ where: { agentId, createdAt: { gte: startOfMonth } } }),
      this.prisma.fieldVisit.count({ where: { agentId, outcome: 'FOLLOW_UP', status: 'COMPLETED' } }),
      this.prisma.fieldVisit.groupBy({
        by: ['status'],
        where: { agentId },
        _count: { id: true },
      }),
      this.prisma.technicianOnboarding.groupBy({
        by: ['status'],
        where: { agentId },
        _count: { id: true },
      }),
      // Get last 30 days daily activity
      this.prisma.fieldVisit.findMany({
        where: {
          agentId,
          scheduledAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { scheduledAt: true, status: true },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    const conversionRate = totalVisits > 0
      ? Math.min(100, Math.round((completedOnboardings / totalVisits) * 100))
      : 0;

    // Build daily activity for the last 30 days
    const dailyActivity: { date: string; visits: number; onboardings: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      dailyActivity.push({ date: dateKey, visits: 0, onboardings: 0 });
    }

    recentVisits.forEach((v) => {
      const dateKey = v.scheduledAt.toISOString().slice(0, 10);
      const entry = dailyActivity.find((d) => d.date === dateKey);
      if (entry) entry.visits++;
    });

    // Convert groupBy results to maps
    const visitStatusMap: Record<string, number> = {};
    visitsByStatus.forEach((v) => { visitStatusMap[v.status] = v._count.id; });

    const onboardingStatusMap: Record<string, number> = {};
    onboardingsByStatus.forEach((o) => { onboardingStatusMap[o.status] = o._count.id; });

    return {
      totalVisits,
      completedVisits,
      totalOnboardings,
      completedOnboardings,
      conversionRate,
      weeklyVisits,
      weeklyOnboardings,
      monthlyVisits,
      monthlyOnboardings,
      pendingFollowUps,
      visitsByStatus: visitStatusMap,
      onboardingsByStatus: onboardingStatusMap,
      dailyActivity,
    };
  }

  async getAgentPerformance(agentId: string) {
    const stats = await this.getAgentStats(agentId);

    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
      },
    });

    // Calculate rank among all agents
    const allAgents = await this.prisma.user.findMany({
      where: { role: 'AGENT' },
      select: { id: true },
    });

    const agentStats = await Promise.all(
      allAgents.map(async (a) => {
        const completed = await this.prisma.technicianOnboarding.count({
          where: { agentId: a.id, status: 'COMPLETED' },
        });
        return { agentId: a.id, completedOnboardings: completed };
      }),
    );

    agentStats.sort((a, b) => b.completedOnboardings - a.completedOnboardings);
    const rank = agentStats.findIndex((a) => a.agentId === agentId) + 1;

    return {
      agentId: agent?.id,
      agentName: agent ? `${agent.firstName} ${agent.lastName}` : '',
      profileImage: agent?.profileImage,
      totalVisits: stats.totalVisits,
      completedOnboardings: stats.completedOnboardings,
      conversionRate: stats.conversionRate,
      weeklyVisits: stats.weeklyVisits,
      weeklyOnboardings: stats.weeklyOnboardings,
      monthlyVisits: stats.monthlyVisits,
      monthlyOnboardings: stats.monthlyOnboardings,
      rank,
      dailyActivity: stats.dailyActivity,
      visitsByStatus: stats.visitsByStatus,
      onboardingsByStatus: stats.onboardingsByStatus,
    };
  }

  // ==========================================
  // ADMIN: ALL AGENTS PERFORMANCE
  // ==========================================

  async getAllAgentPerformances() {
    const agents = await this.prisma.user.findMany({
      where: { role: 'AGENT' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
      },
    });

    const performances = await Promise.all(
      agents.map(async (agent) => {
        const [totalVisits, completedOnboardings, weeklyVisits, weeklyOnboardings] =
          await Promise.all([
            this.prisma.fieldVisit.count({ where: { agentId: agent.id } }),
            this.prisma.technicianOnboarding.count({
              where: { agentId: agent.id, status: 'COMPLETED' },
            }),
            this.prisma.fieldVisit.count({
              where: {
                agentId: agent.id,
                scheduledAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
              },
            }),
            this.prisma.technicianOnboarding.count({
              where: {
                agentId: agent.id,
                createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
              },
            }),
          ]);

        return {
          agentId: agent.id,
          agentName: `${agent.firstName} ${agent.lastName}`,
          profileImage: agent.profileImage,
          totalVisits,
          completedOnboardings,
          conversionRate: totalVisits > 0
            ? Math.min(100, Math.round((completedOnboardings / totalVisits) * 100))
            : 0,
          weeklyVisits,
          weeklyOnboardings,
          rank: 0,
        };
      }),
    );

    // Assign ranks
    performances.sort((a, b) => b.completedOnboardings - a.completedOnboardings);
    performances.forEach((p, i) => { p.rank = i + 1; });

    return performances;
  }

  // ==========================================
  // ADMIN: PLATFORM METRICS
  // ==========================================

  async getPlatformMetrics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalAgents,
      totalFieldVisits,
      totalOnboardings,
      totalTechnicians,
      totalClients,
      totalNeeds,
      totalMissions,
      completedOnboardings,
      thisMonthTechnicians,
      lastMonthTechnicians,
      thisMonthClients,
      lastMonthClients,
      thisMonthNeeds,
      lastMonthNeeds,
      thisMonthMissions,
      lastMonthMissions,
      onboardingFunnel,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'AGENT' } }),
      this.prisma.fieldVisit.count(),
      this.prisma.technicianOnboarding.count(),
      this.prisma.user.count({ where: { role: 'TECHNICIAN' } }),
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
      this.prisma.need.count(),
      this.prisma.mission.count(),
      this.prisma.technicianOnboarding.count({ where: { status: 'COMPLETED' } }),
      this.prisma.user.count({ where: { role: 'TECHNICIAN', createdAt: { gte: startOfMonth } } }),
      this.prisma.user.count({ where: { role: 'TECHNICIAN', createdAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
      this.prisma.user.count({ where: { role: 'CLIENT', createdAt: { gte: startOfMonth } } }),
      this.prisma.user.count({ where: { role: 'CLIENT', createdAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
      this.prisma.need.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.need.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
      this.prisma.mission.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.mission.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
      this.prisma.technicianOnboarding.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const overallConversionRate = totalFieldVisits > 0
      ? Math.min(100, Math.round((completedOnboardings / totalFieldVisits) * 100))
      : 0;

    const calcGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      const growth = Math.round(((current - previous) / previous) * 100);
      return Math.max(-100, Math.min(growth, 999));
    };

    // Build onboarding funnel
    const funnelMap: Record<string, number> = {};
    onboardingFunnel.forEach((o) => { funnelMap[o.status] = o._count.id; });

    // Daily activity (last 7 days)
    const weeklyActivity: { date: string; visits: number; onboardings: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const [visits, onboardings] = await Promise.all([
        this.prisma.fieldVisit.count({
          where: { scheduledAt: { gte: dayStart, lt: dayEnd } },
        }),
        this.prisma.technicianOnboarding.count({
          where: { createdAt: { gte: dayStart, lt: dayEnd } },
        }),
      ]);

      weeklyActivity.push({
        date: dayStart.toISOString().slice(0, 10),
        visits,
        onboardings,
      });
    }

    // Top categories from onboarded technicians — normalize to merge duplicates
    const rawCategories = await this.prisma.technicianOnboarding.groupBy({
      by: ['profession'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    // Merge entries that differ only by case/whitespace/accents
    const categoryMap = new Map<string, { name: string; count: number }>();
    for (const c of rawCategories) {
      const key = c.profession.trim().toLowerCase();
      const existing = categoryMap.get(key);
      if (existing) {
        existing.count += c._count.id;
      } else {
        categoryMap.set(key, { name: c.profession.trim(), count: c._count.id });
      }
    }
    const topCategories = [...categoryMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const agentPerformances = await this.getAllAgentPerformances();

    return {
      totalAgents,
      totalFieldVisits,
      totalOnboardings,
      totalTechnicians,
      totalClients,
      totalNeeds,
      totalMissions,
      overallConversionRate,
      monthlyGrowth: {
        technicians: calcGrowth(thisMonthTechnicians, lastMonthTechnicians),
        clients: calcGrowth(thisMonthClients, lastMonthClients),
        needs: calcGrowth(thisMonthNeeds, lastMonthNeeds),
        missions: calcGrowth(thisMonthMissions, lastMonthMissions),
      },
      weeklyActivity,
      topCategories,
      agentPerformances,
      onboardingFunnel: {
        pending: funnelMap['PENDING'] || 0,
        completed: funnelMap['COMPLETED'] || 0,
        rejected: funnelMap['REJECTED'] || 0,
      },
    };
  }

  async getAgentProfile(agentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profileImage: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user || user.role !== 'AGENT') {
      throw new BadRequestException('Agent not found');
    }

    return user;
  }
}
