import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChantiersService } from './chantiers.service';
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

@ApiTags('Chantiers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'chantiers', version: '1' })
export class ChantiersController {
  constructor(private readonly chantiersService: ChantiersService) {}

  // ── CRUD ──────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Creer un nouveau chantier' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateChantierDto) {
    return this.chantiersService.create(userId, dto);
  }

  @Get('client')
  @ApiOperation({ summary: 'Lister les chantiers du client' })
  getClientChantiers(@CurrentUser('id') userId: string, @Query() query: QueryChantiersDto) {
    return this.chantiersService.getClientChantiers(userId, query);
  }

  @Get('technician')
  @ApiOperation({ summary: 'Lister les chantiers du technicien' })
  getTechnicianChantiers(@CurrentUser('id') userId: string, @Query() query: QueryChantiersDto) {
    return this.chantiersService.getTechnicianChantiers(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d\'un chantier' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.getById(id, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre a jour un chantier' })
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateChantierDto) {
    return this.chantiersService.update(id, userId, dto);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changer le statut du chantier' })
  changeStatus(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: ChangeChantierStatusDto) {
    return this.chantiersService.changeStatus(id, userId, dto);
  }

  // ── Members ───────────────────────────────────────────────

  @Post(':id/members')
  @ApiOperation({ summary: 'Inviter un technicien au chantier' })
  inviteMember(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: InviteMemberDto) {
    return this.chantiersService.inviteMember(id, userId, dto);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Lister les membres du chantier' })
  getMembers(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.getMembers(id, userId);
  }

  @Post(':id/members/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accepter ou refuser une invitation' })
  respondToInvitation(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: RespondToInvitationDto) {
    return this.chantiersService.respondToInvitation(id, userId, dto);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Retirer un membre du chantier' })
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.removeMember(id, memberId, userId);
  }

  // ── Phases ────────────────────────────────────────────────

  @Post(':id/phases')
  @ApiOperation({ summary: 'Creer une phase' })
  createPhase(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: CreatePhaseDto) {
    return this.chantiersService.createPhase(id, userId, dto);
  }

  @Get(':id/phases')
  @ApiOperation({ summary: 'Lister les phases' })
  getPhases(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.getPhases(id, userId);
  }

  @Put(':id/phases/:phaseId')
  @ApiOperation({ summary: 'Mettre a jour une phase' })
  updatePhase(@Param('id') id: string, @Param('phaseId') phaseId: string, @CurrentUser('id') userId: string, @Body() dto: UpdatePhaseDto) {
    return this.chantiersService.updatePhase(id, phaseId, userId, dto);
  }

  @Post(':id/phases/:phaseId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demarrer une phase' })
  startPhase(@Param('id') id: string, @Param('phaseId') phaseId: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.startPhase(id, phaseId, userId);
  }

  @Post(':id/phases/:phaseId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminer une phase' })
  completePhase(@Param('id') id: string, @Param('phaseId') phaseId: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.completePhase(id, phaseId, userId);
  }

  // ── Expenses ──────────────────────────────────────────────

  @Post(':id/expenses')
  @ApiOperation({ summary: 'Ajouter une depense' })
  addExpense(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: AddExpenseDto) {
    return this.chantiersService.addExpense(id, userId, dto);
  }

  @Get(':id/expenses')
  @ApiOperation({ summary: 'Lister les depenses' })
  getExpenses(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.getExpenses(id, userId);
  }

  @Delete(':id/expenses/:expenseId')
  @ApiOperation({ summary: 'Supprimer une depense' })
  removeExpense(@Param('id') id: string, @Param('expenseId') expenseId: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.removeExpense(id, expenseId, userId);
  }

  // ── Documents ─────────────────────────────────────────────

  @Post(':id/documents')
  @ApiOperation({ summary: 'Ajouter un document' })
  addDocument(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: AddChantierDocumentDto) {
    return this.chantiersService.addDocument(id, userId, dto);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Lister les documents' })
  getDocuments(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.getDocuments(id, userId);
  }

  @Delete('documents/:docId')
  @ApiOperation({ summary: 'Supprimer un document' })
  removeDocument(@Param('docId') docId: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.removeDocument(docId, userId);
  }

  // ── Notes ─────────────────────────────────────────────────

  @Post(':id/notes')
  @ApiOperation({ summary: 'Ajouter une note' })
  addNote(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: AddChantierNoteDto) {
    return this.chantiersService.addNote(id, userId, dto);
  }

  @Get(':id/notes')
  @ApiOperation({ summary: 'Lister les notes' })
  getNotes(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.getNotes(id, userId);
  }

  // ── Financial Summary ─────────────────────────────────────

  @Get(':id/financial-summary')
  @ApiOperation({ summary: 'Resume financier du chantier' })
  getFinancialSummary(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.chantiersService.getFinancialSummary(id, userId);
  }
}
