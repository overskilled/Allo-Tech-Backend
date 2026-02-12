import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  CreateResponseDto,
  QueryTicketsDto,
  TicketStatus,
  TicketPriority,
} from './dto/support.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  // ==========================================
  // USER OPERATIONS
  // ==========================================

  async createTicket(userId: string, dto: CreateTicketDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject,
        description: dto.description,
        category: dto.category,
        priority: dto.priority || TicketPriority.NORMAL,
        status: TicketStatus.OPEN,
      },
    });

    // Send confirmation email
    await this.mailService.send({
      to: user.email,
      subject: `Ticket #${ticket.id.slice(-8).toUpperCase()} - ${dto.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2563eb; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AlloTech Support</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2>Bonjour ${user.firstName},</h2>
            <p>Nous avons bien reçu votre demande de support.</p>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Ticket #:</strong> ${ticket.id.slice(-8).toUpperCase()}</p>
              <p><strong>Sujet:</strong> ${dto.subject}</p>
              <p><strong>Catégorie:</strong> ${dto.category}</p>
              <p><strong>Priorité:</strong> ${dto.priority || 'normal'}</p>
            </div>
            <p>Notre équipe vous répondra dans les plus brefs délais.</p>
          </div>
        </div>
      `,
    });

    return ticket;
  }

  async getMyTickets(userId: string, query: QueryTicketsDto) {
    const where: any = { userId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.search) {
      where.subject = { contains: query.search };
    }

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { responses: true },
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return createPaginatedResult(tickets, total, query);
  }

  async getTicketById(ticketId: string, userId: string, isStaff = false) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        responses: {
          where: isStaff ? {} : { isInternal: false },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Check access
    if (!isStaff && ticket.userId !== userId) {
      throw new ForbiddenException('Not authorized to view this ticket');
    }

    return ticket;
  }

  async addResponse(ticketId: string, userId: string, dto: CreateResponseDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Check access
    if (ticket.userId !== userId) {
      throw new ForbiddenException('Not authorized to respond to this ticket');
    }

    // User cannot add internal notes
    if (dto.isInternal) {
      throw new BadRequestException('Users cannot add internal notes');
    }

    const response = await this.prisma.supportResponse.create({
      data: {
        ticketId,
        responderId: userId,
        message: dto.message,
        isInternal: false,
      },
    });

    // Update ticket status if it was waiting for user
    if (ticket.status === TicketStatus.WAITING_USER) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    }

    return response;
  }

  async closeTicket(ticketId: string, userId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.userId !== userId) {
      throw new ForbiddenException('Not authorized to close this ticket');
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.CLOSED,
        resolvedAt: new Date(),
      },
    });
  }

  async reopenTicket(ticketId: string, userId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.userId !== userId) {
      throw new ForbiddenException('Not authorized to reopen this ticket');
    }

    if (ticket.status !== TicketStatus.CLOSED && ticket.status !== TicketStatus.RESOLVED) {
      throw new BadRequestException('Only closed/resolved tickets can be reopened');
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.OPEN,
        resolvedAt: null,
      },
    });
  }

  // ==========================================
  // STAFF OPERATIONS
  // ==========================================

  async getAllTickets(query: QueryTicketsDto) {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.assignedTo) {
      where.assignedTo = query.assignedTo;
    }

    if (query.search) {
      where.subject = { contains: query.search };
    }

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          _count: {
            select: { responses: true },
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    // Add user info
    const ticketsWithUser = await Promise.all(
      tickets.map(async (ticket) => {
        const user = await this.prisma.user.findUnique({
          where: { id: ticket.userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        });
        return { ...ticket, user };
      }),
    );

    return createPaginatedResult(ticketsWithUser, total, query);
  }

  async getStaffTicketById(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        responses: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Get user info
    const user = await this.prisma.user.findUnique({
      where: { id: ticket.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    return { ...ticket, user };
  }

  async updateTicket(ticketId: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const updateData: any = {};

    if (dto.status) {
      updateData.status = dto.status;
      if (dto.status === TicketStatus.RESOLVED || dto.status === TicketStatus.CLOSED) {
        updateData.resolvedAt = new Date();
      }
    }

    if (dto.priority) {
      updateData.priority = dto.priority;
    }

    if (dto.assignedTo !== undefined) {
      updateData.assignedTo = dto.assignedTo;
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    });
  }

  async addStaffResponse(ticketId: string, staffId: string, dto: CreateResponseDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const response = await this.prisma.supportResponse.create({
      data: {
        ticketId,
        responderId: staffId,
        message: dto.message,
        isInternal: dto.isInternal || false,
      },
    });

    // Update ticket status
    if (!dto.isInternal) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.WAITING_USER },
      });

      // Notify user of response
      const user = await this.prisma.user.findUnique({
        where: { id: ticket.userId },
      });

      if (user) {
        await this.notificationsService.create({
          userId: user.id,
          type: 'SYSTEM',
          title: 'Réponse à votre ticket',
          body: `Nouvelle réponse sur le ticket: ${ticket.subject}`,
          data: { ticketId },
        });

        // Email notification
        await this.mailService.send({
          to: user.email,
          subject: `Re: Ticket #${ticketId.slice(-8).toUpperCase()} - ${ticket.subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #2563eb; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">AlloTech Support</h1>
              </div>
              <div style="padding: 30px; background: #f9fafb;">
                <h2>Bonjour ${user.firstName},</h2>
                <p>Vous avez reçu une nouvelle réponse à votre ticket.</p>
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p><strong>Sujet:</strong> ${ticket.subject}</p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 15px 0;">
                  <p>${dto.message}</p>
                </div>
                <p>Connectez-vous pour répondre à ce message.</p>
              </div>
            </div>
          `,
        });
      }
    }

    return response;
  }

  async assignTicket(ticketId: string, staffId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedTo: staffId,
        status: ticket.status === TicketStatus.OPEN ? TicketStatus.IN_PROGRESS : ticket.status,
      },
    });
  }

  async resolveTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });
  }

  // ==========================================
  // STATISTICS
  // ==========================================

  async getTicketStats() {
    const [total, byStatus, byCategory, byPriority, avgResolutionTime] = await Promise.all([
      this.prisma.supportTicket.count(),
      this.prisma.supportTicket.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.supportTicket.groupBy({
        by: ['category'],
        _count: { category: true },
      }),
      this.prisma.supportTicket.groupBy({
        by: ['priority'],
        _count: { priority: true },
      }),
      this.getAverageResolutionTime(),
    ]);

    const statusMap: Record<string, number> = {};
    byStatus.forEach((s) => {
      statusMap[s.status] = s._count.status;
    });

    const categoryMap: Record<string, number> = {};
    byCategory.forEach((c) => {
      categoryMap[c.category] = c._count.category;
    });

    const priorityMap: Record<string, number> = {};
    byPriority.forEach((p) => {
      priorityMap[p.priority] = p._count.priority;
    });

    return {
      total,
      byStatus: statusMap,
      byCategory: categoryMap,
      byPriority: priorityMap,
      avgResolutionTime,
      openTickets: statusMap[TicketStatus.OPEN] || 0,
      inProgressTickets: statusMap[TicketStatus.IN_PROGRESS] || 0,
    };
  }

  private async getAverageResolutionTime(): Promise<number> {
    const resolvedTickets = await this.prisma.supportTicket.findMany({
      where: {
        resolvedAt: { not: null },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    if (resolvedTickets.length === 0) return 0;

    const totalTime = resolvedTickets.reduce((acc, ticket) => {
      const diff = ticket.resolvedAt!.getTime() - ticket.createdAt.getTime();
      return acc + diff;
    }, 0);

    // Return average in hours
    return Math.round(totalTime / resolvedTickets.length / (1000 * 60 * 60));
  }
}
