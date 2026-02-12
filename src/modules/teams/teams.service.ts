import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMemberDto,
  UpdateTeamMemberDto,
  AddMultipleMembersDto,
  QueryTeamsDto,
  TeamMemberRole,
} from './dto/team.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // TEAM MANAGEMENT
  // ==========================================

  async create(creatorId: string, dto: CreateTeamDto) {
    // Verify creator is a technician
    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
    });

    if (!creator || creator.role !== 'TECHNICIAN') {
      throw new ForbiddenException('Only technicians can create teams');
    }

    // Create team with creator as leader
    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        description: dto.description,
        creatorId,
        members: {
          create: {
            userId: creatorId,
            role: TeamMemberRole.LEADER,
          },
        },
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                technicianProfile: {
                  select: {
                    profession: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    return team;
  }

  async update(teamId: string, userId: string, dto: UpdateTeamDto) {
    const team = await this.getTeamWithAccess(teamId, userId, true);

    return this.prisma.team.update({
      where: { id: teamId },
      data: {
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });
  }

  async delete(teamId: string, userId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (team.creatorId !== userId) {
      throw new ForbiddenException('Only the team creator can delete the team');
    }

    await this.prisma.team.delete({
      where: { id: teamId },
    });

    return { message: 'Team deleted successfully' };
  }

  // ==========================================
  // MEMBER MANAGEMENT
  // ==========================================

  async addMember(teamId: string, requesterId: string, dto: AddTeamMemberDto) {
    await this.getTeamWithAccess(teamId, requesterId, true);

    // Verify user exists and is a technician
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user || user.role !== 'TECHNICIAN') {
      throw new BadRequestException('User must be a technician');
    }

    // Check if already a member
    const existing = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: dto.userId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('User is already a team member');
    }

    const member = await this.prisma.teamMember.create({
      data: {
        teamId,
        userId: dto.userId,
        role: dto.role || TeamMemberRole.MEMBER,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            technicianProfile: {
              select: {
                profession: true,
              },
            },
          },
        },
      },
    });

    return member;
  }

  async addMultipleMembers(
    teamId: string,
    requesterId: string,
    dto: AddMultipleMembersDto,
  ) {
    await this.getTeamWithAccess(teamId, requesterId, true);

    const results = {
      added: [] as string[],
      failed: [] as { userId: string; reason: string }[],
    };

    for (const userId of dto.userIds) {
      try {
        // Verify user exists and is a technician
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user || user.role !== 'TECHNICIAN') {
          results.failed.push({ userId, reason: 'User is not a technician' });
          continue;
        }

        // Check if already a member
        const existing = await this.prisma.teamMember.findUnique({
          where: {
            teamId_userId: { teamId, userId },
          },
        });

        if (existing) {
          results.failed.push({ userId, reason: 'Already a member' });
          continue;
        }

        await this.prisma.teamMember.create({
          data: {
            teamId,
            userId,
            role: dto.role || TeamMemberRole.MEMBER,
          },
        });

        results.added.push(userId);
      } catch (error) {
        results.failed.push({ userId, reason: 'Failed to add' });
      }
    }

    return results;
  }

  async updateMemberRole(
    teamId: string,
    memberId: string,
    requesterId: string,
    dto: UpdateTeamMemberDto,
  ) {
    await this.getTeamWithAccess(teamId, requesterId, true);

    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.teamId !== teamId) {
      throw new NotFoundException('Team member not found');
    }

    return this.prisma.teamMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
      },
    });
  }

  async removeMember(teamId: string, memberId: string, requesterId: string) {
    const team = await this.getTeamWithAccess(teamId, requesterId, true);

    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.teamId !== teamId) {
      throw new NotFoundException('Team member not found');
    }

    // Prevent removing the creator
    if (member.userId === team.creatorId) {
      throw new BadRequestException('Cannot remove the team creator');
    }

    await this.prisma.teamMember.delete({
      where: { id: memberId },
    });

    return { message: 'Member removed successfully' };
  }

  async leaveTeam(teamId: string, userId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Creator cannot leave, must delete team
    if (team.creatorId === userId) {
      throw new BadRequestException('Team creator cannot leave. Delete the team instead.');
    }

    const member = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    if (!member) {
      throw new BadRequestException('You are not a member of this team');
    }

    await this.prisma.teamMember.delete({
      where: { id: member.id },
    });

    return { message: 'Successfully left the team' };
  }

  // ==========================================
  // QUERIES
  // ==========================================

  async getMyTeams(userId: string, query: QueryTeamsDto) {
    const where: any = {
      members: {
        some: { userId },
      },
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.name = { contains: query.search };
    }

    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  profileImage: true,
                },
              },
            },
          },
          _count: {
            select: { members: true },
          },
        },
      }),
      this.prisma.team.count({ where }),
    ]);

    return createPaginatedResult(teams, total, query);
  }

  async getTeamById(teamId: string, userId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            technicianProfile: {
              select: {
                profession: true,
                avgRating: true,
              },
            },
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                technicianProfile: {
                  select: {
                    profession: true,
                    avgRating: true,
                    completedJobs: true,
                  },
                },
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Check if user has access (is a member)
    const isMember = team.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this team');
    }

    return team;
  }

  async getTeamMembers(teamId: string, userId: string) {
    await this.getTeamWithAccess(teamId, userId, false);

    return this.prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            profileImage: true,
            technicianProfile: {
              select: {
                profession: true,
                specialties: true,
                avgRating: true,
                completedJobs: true,
                isAvailable: true,
              },
            },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  async searchTechniciansToAdd(teamId: string, userId: string, search: string) {
    await this.getTeamWithAccess(teamId, userId, true);

    // Get current member IDs
    const currentMembers = await this.prisma.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    });

    const memberIds = currentMembers.map((m) => m.userId);

    // Search for technicians not in the team
    return this.prisma.user.findMany({
      where: {
        role: 'TECHNICIAN',
        id: { notIn: memberIds },
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
        ],
      },
      take: 20,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profileImage: true,
        technicianProfile: {
          select: {
            profession: true,
            avgRating: true,
          },
        },
      },
    });
  }

  // ==========================================
  // ADMIN OPERATIONS
  // ==========================================

  async getAllTeams(query: QueryTeamsDto) {
    const where: any = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.name = { contains: query.search };
    }

    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: { members: true },
          },
        },
      }),
      this.prisma.team.count({ where }),
    ]);

    return createPaginatedResult(teams, total, query);
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private async getTeamWithAccess(
    teamId: string,
    userId: string,
    requireLeader: boolean,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: true,
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const member = team.members.find((m) => m.userId === userId);

    if (!member) {
      throw new ForbiddenException('You are not a member of this team');
    }

    if (requireLeader && member.role !== TeamMemberRole.LEADER) {
      throw new ForbiddenException('Only team leaders can perform this action');
    }

    return team;
  }
}
