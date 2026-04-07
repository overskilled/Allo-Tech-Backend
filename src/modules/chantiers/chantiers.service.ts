import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { ChantierStatus, ChantierPhaseStatus, ChantierMemberStatus } from '@prisma/client';
import {
  CreateChantierDto,
  UpdateChantierDto,
  ChangeChantierStatusDto,
  InviteMemberDto,
  RespondToInvitationDto,
  CreatePhaseDto,
  UpdatePhaseDto,
  AddExpenseDto,
  AddChantierDocumentDto,
  AddChantierNoteDto,
  QueryChantiersDto,
} from './dto/chantier.dto';

@Injectable()
export class ChantiersService {
  private readonly logger = new Logger(ChantiersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Prisma Includes ───────────────────────────────────────

  private listIncludes() {
    return {
      client: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
      _count: { select: { members: true, phases: true, expenses: true, documents: true } },
    };
  }

  private detailIncludes() {
    return {
      client: { select: { id: true, firstName: true, lastName: true, profileImage: true, phone: true } },
      members: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, profileImage: true, phone: true, technicianProfile: { select: { profession: true } } } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
      phases: { orderBy: { sortOrder: 'asc' as const } },
      _count: { select: { members: true, phases: true, expenses: true, documents: true, notes: true } },
    };
  }

  // ── Helpers ───────────────────────────────────────────────

  private async getChantierForClient(chantierId: string, clientId: string) {
    const chantier = await this.prisma.chantier.findUnique({
      where: { id: chantierId },
      include: this.detailIncludes(),
    });
    if (!chantier) throw new NotFoundException('Chantier non trouve');
    if (chantier.clientId !== clientId) throw new ForbiddenException('Acces non autorise');
    return chantier;
  }

  private async getChantierForMember(chantierId: string, userId: string) {
    const chantier = await this.prisma.chantier.findUnique({
      where: { id: chantierId },
      include: this.detailIncludes(),
    });
    if (!chantier) throw new NotFoundException('Chantier non trouve');

    const isMember = chantier.clientId === userId ||
      chantier.members.some(m => m.userId === userId && m.status === 'ACCEPTED');
    if (!isMember) throw new ForbiddenException('Acces non autorise');
    return chantier;
  }

  private async recalculateTotalSpent(chantierId: string) {
    const result = await this.prisma.chantierExpense.aggregate({
      where: { chantierId },
      _sum: { amount: true },
    });
    await this.prisma.chantier.update({
      where: { id: chantierId },
      data: { totalSpent: result._sum.amount || 0 },
    });
  }

  private async recalculateProgress(chantierId: string) {
    const phases = await this.prisma.chantierPhase.findMany({
      where: { chantierId },
      select: { progressPercent: true, budgetAllocated: true },
    });
    if (phases.length === 0) {
      await this.prisma.chantier.update({ where: { id: chantierId }, data: { progressPercent: 0 } });
      return;
    }

    const hasBudgets = phases.some(p => p.budgetAllocated && Number(p.budgetAllocated) > 0);
    let progress: number;

    if (hasBudgets) {
      let totalWeight = 0;
      let weightedSum = 0;
      for (const p of phases) {
        const w = Number(p.budgetAllocated) || 1;
        totalWeight += w;
        weightedSum += w * p.progressPercent;
      }
      progress = Math.round(weightedSum / totalWeight);
    } else {
      const sum = phases.reduce((s, p) => s + p.progressPercent, 0);
      progress = Math.round(sum / phases.length);
    }

    await this.prisma.chantier.update({ where: { id: chantierId }, data: { progressPercent: progress } });
  }

  // ── CRUD ──────────────────────────────────────────────────

  async create(clientId: string, dto: CreateChantierDto) {
    return this.prisma.chantier.create({
      data: { clientId, ...dto },
      include: this.detailIncludes(),
    });
  }

  async getClientChantiers(clientId: string, query: QueryChantiersDto) {
    const where: any = { clientId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.chantier.findMany({
        where,
        include: this.listIncludes(),
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: query.sortOrder || 'desc' },
      }),
      this.prisma.chantier.count({ where }),
    ]);

    return createPaginatedResult(data, total, query);
  }

  async getTechnicianChantiers(userId: string, query: QueryChantiersDto) {
    const where: any = {
      members: { some: { userId, status: { in: ['ACCEPTED', 'INVITED'] } } },
    };
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.chantier.findMany({
        where,
        include: {
          ...this.listIncludes(),
          members: { where: { userId }, select: { status: true, specialty: true, role: true } },
        },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: query.sortOrder || 'desc' },
      }),
      this.prisma.chantier.count({ where }),
    ]);

    return createPaginatedResult(data, total, query);
  }

  async getById(chantierId: string, userId: string) {
    const chantier = await this.prisma.chantier.findUnique({
      where: { id: chantierId },
      include: this.detailIncludes(),
    });
    if (!chantier) throw new NotFoundException('Chantier non trouve');

    const isClientOrMember = chantier.clientId === userId ||
      chantier.members.some(m => m.userId === userId && (m.status === 'ACCEPTED' || m.status === 'INVITED'));
    if (!isClientOrMember) throw new ForbiddenException('Acces non autorise');
    return chantier;
  }

  async update(chantierId: string, clientId: string, dto: UpdateChantierDto) {
    await this.getChantierForClient(chantierId, clientId);
    return this.prisma.chantier.update({
      where: { id: chantierId },
      data: dto,
      include: this.detailIncludes(),
    });
  }

  async changeStatus(chantierId: string, clientId: string, dto: ChangeChantierStatusDto) {
    const chantier = await this.getChantierForClient(chantierId, clientId);
    const current = chantier.status;
    const next = dto.status;

    // Validate transitions
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['PLANNING', 'CANCELLED'],
      PLANNING: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
      ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
    };

    if (!validTransitions[current]?.includes(next)) {
      throw new BadRequestException(`Transition de ${current} vers ${next} non autorisee`);
    }

    if (next === 'IN_PROGRESS' && current === 'PLANNING') {
      const acceptedMembers = chantier.members.filter(m => m.status === 'ACCEPTED');
      if (acceptedMembers.length === 0) {
        throw new BadRequestException('Au moins un technicien doit avoir accepte avant de demarrer');
      }
    }

    const updateData: any = { status: next };
    if (next === 'IN_PROGRESS' && !chantier.actualStartDate) {
      updateData.actualStartDate = new Date();
    }
    if (next === 'COMPLETED') {
      updateData.actualEndDate = new Date();
    }

    const updated = await this.prisma.chantier.update({
      where: { id: chantierId },
      data: updateData,
      include: this.detailIncludes(),
    });

    // Notify all accepted members about status change
    const acceptedMembers = chantier.members.filter(m => m.status === 'ACCEPTED');
    for (const member of acceptedMembers) {
      await this.notificationsService.createNotification({
        userId: member.userId,
        type: 'CHANTIER',
        title: 'Mise a jour du chantier',
        body: `Le chantier "${chantier.title}" est maintenant ${this.statusLabel(next)}`,
        data: { chantierId },
      });
    }

    return updated;
  }

  private statusLabel(status: ChantierStatus): string {
    const labels: Record<string, string> = {
      DRAFT: 'en brouillon',
      PLANNING: 'en planification',
      IN_PROGRESS: 'en cours',
      ON_HOLD: 'en pause',
      COMPLETED: 'termine',
      CANCELLED: 'annule',
    };
    return labels[status] || status;
  }

  // ── Members ───────────────────────────────────────────────

  async inviteMember(chantierId: string, clientId: string, dto: InviteMemberDto) {
    const chantier = await this.getChantierForClient(chantierId, clientId);

    // Verify the user is a technician
    const technician = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, role: true, firstName: true, lastName: true },
    });
    if (!technician || technician.role !== 'TECHNICIAN') {
      throw new BadRequestException('L\'utilisateur n\'est pas un technicien');
    }

    // Check if already a member
    const existing = await this.prisma.chantierMember.findUnique({
      where: { chantierId_userId: { chantierId, userId: dto.userId } },
    });
    if (existing && existing.status !== 'DECLINED' && existing.status !== 'REMOVED') {
      throw new BadRequestException('Ce technicien est deja membre ou invite');
    }

    const member = existing
      ? await this.prisma.chantierMember.update({
          where: { id: existing.id },
          data: { status: 'INVITED', specialty: dto.specialty, role: dto.role || 'worker', dailyRate: dto.dailyRate, fixedPrice: dto.fixedPrice, invitedAt: new Date(), respondedAt: null },
          include: { user: { select: { id: true, firstName: true, lastName: true, profileImage: true } } },
        })
      : await this.prisma.chantierMember.create({
          data: { chantierId, userId: dto.userId, specialty: dto.specialty, role: dto.role || 'worker', dailyRate: dto.dailyRate, fixedPrice: dto.fixedPrice },
          include: { user: { select: { id: true, firstName: true, lastName: true, profileImage: true } } },
        });

    // Auto-transition DRAFT -> PLANNING
    if (chantier.status === 'DRAFT') {
      await this.prisma.chantier.update({ where: { id: chantierId }, data: { status: 'PLANNING' } });
    }

    // Notify technician
    await this.notificationsService.createNotification({
      userId: dto.userId,
      type: 'CHANTIER',
      title: 'Invitation a un chantier',
      body: `Vous etes invite a rejoindre le chantier "${chantier.title}" en tant que ${dto.specialty}`,
      data: { chantierId },
    });

    return member;
  }

  async getMembers(chantierId: string, userId: string) {
    await this.getChantierForMember(chantierId, userId);
    return this.prisma.chantierMember.findMany({
      where: { chantierId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, profileImage: true, phone: true, technicianProfile: { select: { profession: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async respondToInvitation(chantierId: string, userId: string, dto: RespondToInvitationDto) {
    const member = await this.prisma.chantierMember.findUnique({
      where: { chantierId_userId: { chantierId, userId } },
    });
    if (!member) throw new NotFoundException('Invitation non trouvee');
    if (member.status !== 'INVITED') throw new BadRequestException('Invitation deja traitee');

    const updated = await this.prisma.chantierMember.update({
      where: { id: member.id },
      data: { status: dto.accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
      include: { user: { select: { id: true, firstName: true, lastName: true, profileImage: true } } },
    });

    // Notify client
    const chantier = await this.prisma.chantier.findUnique({ where: { id: chantierId }, select: { clientId: true, title: true } });
    if (chantier) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      await this.notificationsService.createNotification({
        userId: chantier.clientId,
        type: 'CHANTIER',
        title: dto.accept ? 'Invitation acceptee' : 'Invitation refusee',
        body: `${user?.firstName} ${user?.lastName} a ${dto.accept ? 'accepte' : 'refuse'} l'invitation au chantier "${chantier.title}"`,
        data: { chantierId },
      });
    }

    return updated;
  }

  async removeMember(chantierId: string, memberId: string, clientId: string) {
    await this.getChantierForClient(chantierId, clientId);
    const member = await this.prisma.chantierMember.findFirst({
      where: { id: memberId, chantierId },
    });
    if (!member) throw new NotFoundException('Membre non trouve');

    return this.prisma.chantierMember.update({
      where: { id: memberId },
      data: { status: 'REMOVED' },
    });
  }

  // ── Phases ────────────────────────────────────────────────

  async createPhase(chantierId: string, clientId: string, dto: CreatePhaseDto) {
    await this.getChantierForClient(chantierId, clientId);

    const phase = await this.prisma.chantierPhase.create({
      data: { chantierId, ...dto },
    });

    await this.recalculateProgress(chantierId);
    return phase;
  }

  async getPhases(chantierId: string, userId: string) {
    await this.getChantierForMember(chantierId, userId);
    return this.prisma.chantierPhase.findMany({
      where: { chantierId },
      include: { _count: { select: { expenses: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updatePhase(chantierId: string, phaseId: string, userId: string, dto: UpdatePhaseDto) {
    await this.getChantierForMember(chantierId, userId);
    const phase = await this.prisma.chantierPhase.findFirst({ where: { id: phaseId, chantierId } });
    if (!phase) throw new NotFoundException('Phase non trouvee');

    const updated = await this.prisma.chantierPhase.update({
      where: { id: phaseId },
      data: dto,
    });

    if (dto.progressPercent !== undefined) {
      await this.recalculateProgress(chantierId);
    }

    return updated;
  }

  async startPhase(chantierId: string, phaseId: string, clientId: string) {
    await this.getChantierForClient(chantierId, clientId);
    const phase = await this.prisma.chantierPhase.findFirst({ where: { id: phaseId, chantierId } });
    if (!phase) throw new NotFoundException('Phase non trouvee');
    if (phase.status !== 'PLANNED') throw new BadRequestException('La phase doit etre en statut PLANNED');

    return this.prisma.chantierPhase.update({
      where: { id: phaseId },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date() },
    });
  }

  async completePhase(chantierId: string, phaseId: string, clientId: string) {
    await this.getChantierForClient(chantierId, clientId);
    const phase = await this.prisma.chantierPhase.findFirst({ where: { id: phaseId, chantierId } });
    if (!phase) throw new NotFoundException('Phase non trouvee');
    if (phase.status !== 'IN_PROGRESS') throw new BadRequestException('La phase doit etre en cours');

    const updated = await this.prisma.chantierPhase.update({
      where: { id: phaseId },
      data: { status: 'COMPLETED', progressPercent: 100, completedAt: new Date(), actualEndDate: new Date() },
    });

    await this.recalculateProgress(chantierId);
    return updated;
  }

  // ── Expenses ──────────────────────────────────────────────

  async addExpense(chantierId: string, userId: string, dto: AddExpenseDto) {
    await this.getChantierForMember(chantierId, userId);

    if (dto.phaseId) {
      const phase = await this.prisma.chantierPhase.findFirst({ where: { id: dto.phaseId, chantierId } });
      if (!phase) throw new BadRequestException('Phase non trouvee');
    }

    const expense = await this.prisma.chantierExpense.create({
      data: { chantierId, recordedBy: userId, ...dto },
    });

    await this.recalculateTotalSpent(chantierId);
    return expense;
  }

  async getExpenses(chantierId: string, userId: string) {
    await this.getChantierForMember(chantierId, userId);
    return this.prisma.chantierExpense.findMany({
      where: { chantierId },
      include: { phase: { select: { id: true, name: true } } },
      orderBy: { expenseDate: 'desc' },
    });
  }

  async removeExpense(chantierId: string, expenseId: string, userId: string) {
    const chantier = await this.prisma.chantier.findUnique({ where: { id: chantierId }, select: { clientId: true } });
    if (!chantier) throw new NotFoundException('Chantier non trouve');

    const expense = await this.prisma.chantierExpense.findFirst({ where: { id: expenseId, chantierId } });
    if (!expense) throw new NotFoundException('Depense non trouvee');

    if (expense.recordedBy !== userId && chantier.clientId !== userId) {
      throw new ForbiddenException('Seul l\'auteur ou le client peut supprimer cette depense');
    }

    await this.prisma.chantierExpense.delete({ where: { id: expenseId } });
    await this.recalculateTotalSpent(chantierId);
  }

  // ── Documents ─────────────────────────────────────────────

  async addDocument(chantierId: string, userId: string, dto: AddChantierDocumentDto) {
    await this.getChantierForMember(chantierId, userId);
    return this.prisma.chantierDocument.create({
      data: { chantierId, uploadedBy: userId, ...dto },
    });
  }

  async getDocuments(chantierId: string, userId: string) {
    await this.getChantierForMember(chantierId, userId);
    return this.prisma.chantierDocument.findMany({
      where: { chantierId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeDocument(docId: string, userId: string) {
    const doc = await this.prisma.chantierDocument.findUnique({
      where: { id: docId },
      include: { chantier: { select: { clientId: true } } },
    });
    if (!doc) throw new NotFoundException('Document non trouve');
    if (doc.uploadedBy !== userId && doc.chantier.clientId !== userId) {
      throw new ForbiddenException('Acces non autorise');
    }
    await this.prisma.chantierDocument.delete({ where: { id: docId } });
  }

  // ── Notes ─────────────────────────────────────────────────

  async addNote(chantierId: string, userId: string, dto: AddChantierNoteDto) {
    await this.getChantierForMember(chantierId, userId);
    return this.prisma.chantierNote.create({
      data: { chantierId, authorId: userId, content: dto.content },
    });
  }

  async getNotes(chantierId: string, userId: string) {
    await this.getChantierForMember(chantierId, userId);
    return this.prisma.chantierNote.findMany({
      where: { chantierId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Financial Summary ─────────────────────────────────────

  async getFinancialSummary(chantierId: string, clientId: string) {
    const chantier = await this.getChantierForClient(chantierId, clientId);

    const expenses = await this.prisma.chantierExpense.findMany({
      where: { chantierId },
      include: { phase: { select: { id: true, name: true } } },
    });

    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalBudget = Number(chantier.totalBudget);
    const remaining = totalBudget - totalSpent;
    const percentUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    // By category
    const byCategoryMap = new Map<string, number>();
    for (const e of expenses) {
      byCategoryMap.set(e.category, (byCategoryMap.get(e.category) || 0) + Number(e.amount));
    }
    const byCategory = Array.from(byCategoryMap.entries()).map(([category, total]) => ({ category, total }));

    // By phase
    const byPhaseMap = new Map<string, { phaseName: string; total: number }>();
    for (const e of expenses) {
      if (e.phaseId && e.phase) {
        const existing = byPhaseMap.get(e.phaseId) || { phaseName: e.phase.name, total: 0 };
        existing.total += Number(e.amount);
        byPhaseMap.set(e.phaseId, existing);
      }
    }
    const byPhase = Array.from(byPhaseMap.entries()).map(([phaseId, v]) => ({ phaseId, phaseName: v.phaseName, total: v.total }));

    // By technician
    const recorderIds = [...new Set(expenses.map(e => e.recordedBy))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: recorderIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

    const byTechMap = new Map<string, number>();
    for (const e of expenses) {
      byTechMap.set(e.recordedBy, (byTechMap.get(e.recordedBy) || 0) + Number(e.amount));
    }
    const byTechnician = Array.from(byTechMap.entries()).map(([userId, total]) => ({
      userId,
      userName: userMap.get(userId) || 'Inconnu',
      total,
    }));

    return {
      totalBudget,
      totalSpent,
      remaining,
      percentUsed,
      byCategory,
      byPhase,
      byTechnician,
    };
  }
}
