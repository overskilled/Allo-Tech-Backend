import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CancelAppointmentDto,
  QueryAppointmentsDto,
} from './dto/appointment.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // APPOINTMENT CRUD
  // ==========================================

  async createAppointment(clientId: string, dto: CreateAppointmentDto) {
    // Verify technician exists
    const technician = await this.prisma.user.findUnique({
      where: { id: dto.technicianId },
      include: { technicianProfile: true },
    });

    if (!technician || technician.role !== 'TECHNICIAN') {
      throw new BadRequestException('Invalid technician');
    }

    // If needId provided, verify it belongs to client and has accepted candidature
    if (dto.needId) {
      const need = await this.prisma.need.findUnique({
        where: { id: dto.needId },
        include: {
          candidatures: {
            where: { technicianId: dto.technicianId, status: 'ACCEPTED' },
          },
        },
      });

      if (!need) {
        throw new NotFoundException('Need not found');
      }

      if (need.clientId !== clientId) {
        throw new ForbiddenException('Not authorized');
      }

      if (need.candidatures.length === 0) {
        throw new BadRequestException(
          'You must accept a candidature from this technician first',
        );
      }
    }

    // Check technician availability (simple check - no overlapping appointments)
    const scheduledDateTime = new Date(`${dto.scheduledDate}T${dto.scheduledTime}`);
    const duration = dto.duration || 60;
    const endTime = new Date(scheduledDateTime.getTime() + duration * 60000);

    const overlapping = await this.prisma.appointment.findFirst({
      where: {
        technicianId: dto.technicianId,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        scheduledDate: new Date(dto.scheduledDate),
        OR: [
          {
            scheduledTime: {
              gte: dto.scheduledTime,
              lt: this.addMinutesToTime(dto.scheduledTime, duration),
            },
          },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException('Technician has a conflicting appointment at this time');
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        clientId,
        technicianId: dto.technicianId,
        needId: dto.needId,
        scheduledDate: new Date(dto.scheduledDate),
        scheduledTime: dto.scheduledTime,
        duration,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        notes: dto.notes,
        status: 'PENDING',
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            phone: true,
          },
        },
        technician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            phone: true,
          },
        },
        need: {
          select: {
            id: true,
            title: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    // TODO: Send notification to technician about new appointment

    return appointment;
  }

  async updateAppointment(
    appointmentId: string,
    userId: string,
    dto: UpdateAppointmentDto,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Only client or technician can update
    if (appointment.clientId !== userId && appointment.technicianId !== userId) {
      throw new ForbiddenException('Not authorized to update this appointment');
    }

    // Can only update pending or confirmed appointments
    if (!['PENDING', 'CONFIRMED'].includes(appointment.status)) {
      throw new BadRequestException('Cannot update appointment in current status');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        scheduledTime: dto.scheduledTime,
        duration: dto.duration,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        notes: dto.notes,
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        technician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }

  async cancelAppointment(
    appointmentId: string,
    userId: string,
    dto: CancelAppointmentDto,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.clientId !== userId && appointment.technicianId !== userId) {
      throw new ForbiddenException('Not authorized to cancel this appointment');
    }

    if (['COMPLETED', 'CANCELLED'].includes(appointment.status)) {
      throw new BadRequestException('Cannot cancel appointment in current status');
    }

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
    });

    // TODO: Send notification to other party

    return { message: 'Appointment cancelled successfully' };
  }

  // ==========================================
  // STATUS UPDATES
  // ==========================================

  async confirmAppointment(appointmentId: string, technicianId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized');
    }

    if (appointment.status !== 'PENDING') {
      throw new BadRequestException('Can only confirm pending appointments');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CONFIRMED' },
    });
  }

  async startAppointment(appointmentId: string, technicianId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized');
    }

    if (appointment.status !== 'CONFIRMED') {
      throw new BadRequestException('Can only start confirmed appointments');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'IN_PROGRESS',
        technicianStartedAt: new Date(),
      },
    });
  }

  async technicianArrived(appointmentId: string, technicianId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized');
    }

    if (appointment.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Appointment must be in progress');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { technicianArrivedAt: new Date() },
    });
  }

  async completeAppointment(appointmentId: string, technicianId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { need: true },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.technicianId !== technicianId) {
      throw new ForbiddenException('Not authorized');
    }

    if (appointment.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Can only complete in-progress appointments');
    }

    // Update appointment
    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Update technician stats
    await this.prisma.technicianProfile.update({
      where: { userId: technicianId },
      data: {
        completedJobs: { increment: 1 },
        totalJobs: { increment: 1 },
      },
    });

    // If linked to a need, update need status
    if (appointment.needId) {
      await this.prisma.need.update({
        where: { id: appointment.needId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    // TODO: Send notification to client to rate the technician

    return updated;
  }

  async markNoShow(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Both client and technician can mark no-show
    if (appointment.clientId !== userId && appointment.technicianId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    if (!['CONFIRMED', 'IN_PROGRESS'].includes(appointment.status)) {
      throw new BadRequestException('Cannot mark as no-show in current status');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'NO_SHOW' },
    });
  }

  // ==========================================
  // QUERY OPERATIONS
  // ==========================================

  async getClientAppointments(clientId: string, query: QueryAppointmentsDto) {
    const where: any = { clientId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.date) {
      where.scheduledDate = new Date(query.date);
    }

    if (query.startDate && query.endDate) {
      where.scheduledDate = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { scheduledDate: 'asc' },
        include: {
          technician: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              phone: true,
              technicianProfile: {
                select: {
                  profession: true,
                  avgRating: true,
                  isVerified: true,
                },
              },
            },
          },
          need: {
            select: {
              id: true,
              title: true,
              category: { select: { name: true, icon: true } },
            },
          },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return createPaginatedResult(appointments, total, query);
  }

  async getTechnicianAppointments(technicianId: string, query: QueryAppointmentsDto) {
    const where: any = { technicianId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.date) {
      where.scheduledDate = new Date(query.date);
    }

    if (query.startDate && query.endDate) {
      where.scheduledDate = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { scheduledDate: 'asc' },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              phone: true,
            },
          },
          need: {
            select: {
              id: true,
              title: true,
              description: true,
              category: { select: { name: true, icon: true } },
            },
          },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return createPaginatedResult(appointments, total, query);
  }

  async getAppointmentById(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            phone: true,
            email: true,
            clientProfile: {
              select: {
                address: true,
                city: true,
                neighborhood: true,
              },
            },
          },
        },
        technician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            phone: true,
            email: true,
            technicianProfile: {
              select: {
                profession: true,
                avgRating: true,
                isVerified: true,
              },
            },
          },
        },
        need: {
          select: {
            id: true,
            title: true,
            description: true,
            urgency: true,
            images: true,
            category: { select: { name: true, icon: true } },
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.clientId !== userId && appointment.technicianId !== userId) {
      throw new ForbiddenException('Not authorized to view this appointment');
    }

    return appointment;
  }

  async getUpcomingAppointments(userId: string, role: 'CLIENT' | 'TECHNICIAN', limit = 5) {
    const where: any = {
      status: { in: ['PENDING', 'CONFIRMED'] },
      scheduledDate: { gte: new Date() },
    };

    if (role === 'CLIENT') {
      where.clientId = userId;
    } else {
      where.technicianId = userId;
    }

    return this.prisma.appointment.findMany({
      where,
      take: limit,
      orderBy: { scheduledDate: 'asc' },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
        technician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
        need: {
          select: {
            id: true,
            title: true,
            category: { select: { name: true } },
          },
        },
      },
    });
  }

  async getCalendarData(userId: string, role: 'CLIENT' | 'TECHNICIAN', month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const where: any = {
      scheduledDate: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (role === 'CLIENT') {
      where.clientId = userId;
    } else {
      where.technicianId = userId;
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      select: {
        id: true,
        scheduledDate: true,
        scheduledTime: true,
        duration: true,
        status: true,
        need: {
          select: {
            title: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    // Group by date
    const calendarData: Record<string, any[]> = {};
    appointments.forEach((apt) => {
      const dateKey = apt.scheduledDate.toISOString().split('T')[0];
      if (!calendarData[dateKey]) {
        calendarData[dateKey] = [];
      }
      calendarData[dateKey].push(apt);
    });

    return calendarData;
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private addMinutesToTime(time: string, minutes: number): string {
    const [hours, mins] = time.split(':').map(Number);
    const totalMins = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMins / 60) % 24;
    const newMins = totalMins % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
  }
}
