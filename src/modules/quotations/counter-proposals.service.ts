import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCounterProposalDto,
  RespondCounterProposalDto,
} from './dto/counter-proposal.dto';

@Injectable()
export class CounterProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCounterProposal(
    quotationId: string,
    userId: string,
    dto: CreateCounterProposalDto,
  ) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { need: true },
    });

    if (!quotation) {
      throw new NotFoundException('Devis introuvable');
    }

    // Only the client or technician involved can counter-propose
    const isClient = quotation.need.clientId === userId;
    const isTechnician = quotation.technicianId === userId;

    if (!isClient && !isTechnician) {
      throw new ForbiddenException('Accès non autorisé');
    }

    if (quotation.status !== 'SENT' && quotation.status !== 'COUNTER_PROPOSED') {
      throw new BadRequestException(
        'Le devis doit être envoyé ou en contre-proposition pour être négocié',
      );
    }

    // Mark any pending counter-proposals as superseded
    await this.prisma.counterProposal.updateMany({
      where: { quotationId, status: 'PENDING' },
      data: { status: 'SUPERSEDED' },
    });

    // Create the new counter-proposal
    const counterProposal = await this.prisma.counterProposal.create({
      data: {
        quotationId,
        proposedBy: userId,
        proposerRole: isClient ? 'CLIENT' : 'TECHNICIAN',
        proposedTotal: dto.proposedTotal,
        proposedLabor: dto.proposedLabor,
        proposedMaterials: dto.proposedMaterials,
        message: dto.message,
        status: 'PENDING',
      },
    });

    // Update quotation status to COUNTER_PROPOSED
    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'COUNTER_PROPOSED' },
    });

    return counterProposal;
  }

  async respondToCounterProposal(
    counterProposalId: string,
    userId: string,
    dto: RespondCounterProposalDto,
  ) {
    const counterProposal = await this.prisma.counterProposal.findUnique({
      where: { id: counterProposalId },
      include: {
        quotation: {
          include: { need: true },
        },
      },
    });

    if (!counterProposal) {
      throw new NotFoundException('Contre-proposition introuvable');
    }

    if (counterProposal.status !== 'PENDING') {
      throw new BadRequestException('Cette contre-proposition a déjà été traitée');
    }

    // The responder must be the OTHER party
    const quotation = counterProposal.quotation;
    const isClient = quotation.need.clientId === userId;
    const isTechnician = quotation.technicianId === userId;

    if (!isClient && !isTechnician) {
      throw new ForbiddenException('Accès non autorisé');
    }

    // The person who proposed cannot respond to their own proposal
    if (counterProposal.proposedBy === userId) {
      throw new BadRequestException('Vous ne pouvez pas répondre à votre propre proposition');
    }

    const newStatus = dto.accept ? 'ACCEPTED' : 'REJECTED';

    const updated = await this.prisma.counterProposal.update({
      where: { id: counterProposalId },
      data: {
        status: newStatus,
        respondedAt: new Date(),
        responseMessage: dto.responseMessage,
      },
    });

    if (dto.accept) {
      // Update the quotation with the proposed amounts
      const updateData: any = {
        status: 'SENT', // Reset to SENT so the client can sign
      };

      if (counterProposal.proposedTotal) {
        updateData.totalCost = counterProposal.proposedTotal;
      }
      if (counterProposal.proposedLabor) {
        updateData.laborCost = counterProposal.proposedLabor;
      }
      if (counterProposal.proposedMaterials) {
        // Recalculate materialsCost from proposed materials
        try {
          const materials = JSON.parse(counterProposal.proposedMaterials);
          const materialsCost = materials.reduce(
            (sum: number, m: any) => sum + (m.quantity || 0) * (m.unitPrice || 0),
            0,
          );
          updateData.materials = counterProposal.proposedMaterials;
          updateData.materialsCost = materialsCost;
          if (!counterProposal.proposedTotal) {
            updateData.totalCost = materialsCost + Number(updateData.laborCost || quotation.laborCost);
          }
        } catch {
          // Keep existing materials if parse fails
        }
      }

      // Re-generate signature token for re-signing
      updateData.signatureToken = uuidv4();
      updateData.signatureTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      updateData.clientSignature = null;
      updateData.clientSignedAt = null;

      await this.prisma.quotation.update({
        where: { id: quotation.id },
        data: updateData,
      });
    } else {
      // Rejected — return quotation to SENT status
      await this.prisma.quotation.update({
        where: { id: quotation.id },
        data: { status: 'SENT' },
      });
    }

    return updated;
  }

  async getCounterProposals(quotationId: string, userId: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { need: true },
    });

    if (!quotation) {
      throw new NotFoundException('Devis introuvable');
    }

    const isClient = quotation.need.clientId === userId;
    const isTechnician = quotation.technicianId === userId;

    if (!isClient && !isTechnician) {
      throw new ForbiddenException('Accès non autorisé');
    }

    return this.prisma.counterProposal.findMany({
      where: { quotationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
