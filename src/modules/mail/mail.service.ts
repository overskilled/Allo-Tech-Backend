import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

// ==========================================
// SHARED TEMPLATE WRAPPER
// ==========================================

function wrap(headerColor: string, body: string): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: ${headerColor}; padding: 24px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 22px; letter-spacing: 1px;">AlloTech</h1>
      </div>
      <div style="padding: 32px 28px; background: #f9fafb;">
        ${body}
      </div>
      <div style="background: #1f2937; padding: 20px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} AlloTech. Tous droits réservés.</p>
      </div>
    </div>
  `;
}

function btn(url: string, label: string, color = '#167bda'): string {
  return `
    <div style="text-align: center; margin: 28px 0;">
      <a href="${url}" style="background: ${color}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 14px;">${label}</a>
    </div>
  `;
}

function infoBox(rows: string): string {
  return `<div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">${rows}</div>`;
}

function row(label: string, value: string): string {
  return `<p style="margin: 6px 0;"><strong style="color: #374151;">${label}:</strong> <span style="color: #6b7280;">${value}</span></p>`;
}

// ==========================================
// EMAIL TEMPLATES
// ==========================================

const TEMPLATES = {
  // ── Authentication ──────────────────────────
  EMAIL_VERIFICATION: (data: { name: string; verificationUrl: string }) => ({
    subject: 'Vérifiez votre adresse email - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">Merci de vous être inscrit sur AlloTech. Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email.</p>
      ${btn(data.verificationUrl, 'Vérifier mon email')}
      <p style="color: #6b7280; font-size: 14px;">Ce lien expire dans 24 heures.</p>
      <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas créé de compte, ignorez cet email.</p>
    `),
  }),

  PASSWORD_RESET: (data: { name: string; resetUrl: string }) => ({
    subject: 'Réinitialisation de mot de passe - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.</p>
      ${btn(data.resetUrl, 'Réinitialiser mon mot de passe')}
      <p style="color: #6b7280; font-size: 14px;">Ce lien expire dans 1 heure.</p>
      <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
    `),
  }),

  WELCOME: (data: { name: string; role: string }) => ({
    subject: 'Bienvenue sur AlloTech !',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bienvenue ${data.name} !</h2>
      <p style="color: #374151;">Nous sommes ravis de vous accueillir sur AlloTech.</p>
      ${data.role === 'TECHNICIAN' ? `
        <p style="color: #374151;">En tant que technicien, vous pouvez maintenant :</p>
        <ul style="color: #374151;">
          <li>Consulter les demandes de clients</li>
          <li>Soumettre des candidatures</li>
          <li>Gérer vos rendez-vous</li>
          <li>Créer des devis</li>
          <li>Présenter vos réalisations</li>
        </ul>
      ` : `
        <p style="color: #374151;">En tant que client, vous pouvez maintenant :</p>
        <ul style="color: #374151;">
          <li>Publier vos besoins</li>
          <li>Trouver des techniciens qualifiés</li>
          <li>Prendre des rendez-vous</li>
          <li>Recevoir des devis</li>
          <li>Évaluer les prestations</li>
        </ul>
      `}
      ${btn('#', 'Accéder à mon compte')}
    `),
  }),

  // ── Appointments ────────────────────────────
  APPOINTMENT_CREATED: (data: { technicianName: string; clientName: string; needTitle: string; date: string; time: string; address: string }) => ({
    subject: 'Nouveau rendez-vous reçu - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.technicianName},</h2>
      <p style="color: #374151;">Vous avez reçu une nouvelle demande de rendez-vous de <strong>${data.clientName}</strong>.</p>
      ${infoBox(`
        ${row('Demande', data.needTitle)}
        ${row('Date', data.date)}
        ${row('Heure', data.time)}
        ${row('Adresse', data.address)}
      `)}
      <p style="color: #374151;">Connectez-vous à l'application pour confirmer ou gérer ce rendez-vous.</p>
      ${btn('#', 'Voir le rendez-vous')}
    `),
  }),

  APPOINTMENT_CONFIRMED: (data: { clientName: string; technicianName: string; date: string; time: string; address: string }) => ({
    subject: 'Rendez-vous confirmé - AlloTech',
    html: wrap('#5bc288', `
      <h2 style="color: #111827;">Bonjour ${data.clientName},</h2>
      <p style="color: #374151;">Votre rendez-vous a été confirmé avec succès !</p>
      ${infoBox(`
        ${row('Technicien', data.technicianName)}
        ${row('Date', data.date)}
        ${row('Heure', data.time)}
        ${row('Adresse', data.address)}
      `)}
      <p style="color: #374151;">Le technicien vous contactera pour confirmer les détails.</p>
    `),
  }),

  APPOINTMENT_CANCELLED: (data: { name: string; date: string; time: string; reason?: string; cancelledBy: string }) => ({
    subject: 'Rendez-vous annulé - AlloTech',
    html: wrap('#dc2626', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">Le rendez-vous prévu le <strong>${data.date}</strong> à <strong>${data.time}</strong> a été annulé par le <strong>${data.cancelledBy}</strong>.</p>
      ${data.reason ? `<p style="color: #374151;"><strong>Raison :</strong> ${data.reason}</p>` : ''}
      <p style="color: #374151;">Vous pouvez planifier un nouveau rendez-vous depuis l'application.</p>
    `),
  }),

  APPOINTMENT_STARTED: (data: { clientName: string; technicianName: string }) => ({
    subject: 'Votre technicien est en route - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.clientName},</h2>
      <p style="color: #374151;"><strong>${data.technicianName}</strong> est en route vers votre adresse. Préparez-vous pour son arrivée !</p>
    `),
  }),

  APPOINTMENT_COMPLETED: (data: { clientName: string; technicianName: string }) => ({
    subject: 'Rendez-vous terminé - Donnez votre avis ! - AlloTech',
    html: wrap('#5bc288', `
      <h2 style="color: #111827;">Bonjour ${data.clientName},</h2>
      <p style="color: #374151;">Votre intervention avec <strong>${data.technicianName}</strong> est maintenant terminée.</p>
      <p style="color: #374151;">Votre avis est important ! Prenez un moment pour évaluer le technicien.</p>
      ${btn('#', 'Donner mon avis', '#5bc288')}
    `),
  }),

  // ── Candidatures ────────────────────────────
  NEW_CANDIDATURE: (data: { clientName: string; technicianName: string; needTitle: string; message?: string; proposedPrice?: number }) => ({
    subject: 'Nouvelle candidature reçue - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.clientName},</h2>
      <p style="color: #374151;">Un technicien a postulé pour votre demande !</p>
      ${infoBox(`
        ${row('Demande', data.needTitle)}
        ${row('Technicien', data.technicianName)}
        ${data.proposedPrice ? row('Prix proposé', `${data.proposedPrice.toLocaleString('fr-FR')} XAF`) : ''}
        ${data.message ? row('Message', data.message) : ''}
      `)}
      <p style="color: #374151;">Consultez le profil du technicien et répondez à sa candidature.</p>
      ${btn('#', 'Voir la candidature')}
    `),
  }),

  CANDIDATURE_ACCEPTED: (data: { technicianName: string; needTitle: string; clientName: string; date?: string; time?: string }) => ({
    subject: 'Votre candidature a été acceptée ! - AlloTech',
    html: wrap('#5bc288', `
      <h2 style="color: #111827;">Félicitations ${data.technicianName} !</h2>
      <p style="color: #374151;">Votre candidature pour <strong>"${data.needTitle}"</strong> a été acceptée par <strong>${data.clientName}</strong> !</p>
      ${data.date ? infoBox(`
        ${row('Date proposée', data.date)}
        ${data.time ? row('Heure', data.time) : ''}
      `) : ''}
      <p style="color: #374151;">Une mission a été créée. Connectez-vous pour la consulter et la planifier.</p>
      ${btn('#', 'Voir ma mission', '#5bc288')}
    `),
  }),

  CANDIDATURE_REJECTED: (data: { technicianName: string; needTitle: string }) => ({
    subject: 'Candidature non retenue - AlloTech',
    html: wrap('#6b7280', `
      <h2 style="color: #111827;">Bonjour ${data.technicianName},</h2>
      <p style="color: #374151;">Votre candidature pour <strong>"${data.needTitle}"</strong> n'a malheureusement pas été retenue.</p>
      <p style="color: #374151;">Ne vous découragez pas ! De nouvelles demandes sont publiées régulièrement.</p>
      ${btn('#', 'Voir les demandes disponibles')}
    `),
  }),

  // ── Quotations ──────────────────────────────
  NEW_QUOTATION: (data: { clientName: string; technicianName: string; needTitle: string; totalCost: string; currency: string; signingUrl?: string }) => ({
    subject: 'Nouveau devis reçu - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.clientName},</h2>
      <p style="color: #374151;">Vous avez reçu un nouveau devis !</p>
      ${infoBox(`
        ${row('Demande', data.needTitle)}
        ${row('Technicien', data.technicianName)}
        ${row('Montant total', `${data.totalCost} ${data.currency}`)}
      `)}
      <p style="color: #374151;">Consultez le devis et signez-le directement depuis l'application ou via le lien ci-dessous.</p>
      ${data.signingUrl ? btn(data.signingUrl, 'Consulter et signer le devis') : btn('#', 'Voir le devis')}
    `),
  }),

  QUOTATION_ACCEPTED: (data: { technicianName: string; needTitle: string; totalCost: string; currency: string }) => ({
    subject: 'Votre devis a été accepté ! - AlloTech',
    html: wrap('#5bc288', `
      <h2 style="color: #111827;">Bonne nouvelle ${data.technicianName} !</h2>
      <p style="color: #374151;">Votre devis pour <strong>"${data.needTitle}"</strong> a été accepté et signé par le client.</p>
      ${infoBox(`${row('Montant', `${data.totalCost} ${data.currency}`)}`)}
      <p style="color: #374151;">Une mission a été automatiquement créée. Planifiez-la dès maintenant.</p>
      ${btn('#', 'Voir la mission', '#5bc288')}
    `),
  }),

  QUOTATION_REJECTED: (data: { technicianName: string; needTitle: string; reason?: string }) => ({
    subject: 'Devis refusé - AlloTech',
    html: wrap('#6b7280', `
      <h2 style="color: #111827;">Bonjour ${data.technicianName},</h2>
      <p style="color: #374151;">Votre devis pour <strong>"${data.needTitle}"</strong> a été refusé par le client.</p>
      ${data.reason ? `<p style="color: #374151;"><strong>Message du client :</strong> ${data.reason}</p>` : ''}
    `),
  }),

  // ── Missions ────────────────────────────────
  MISSION_CREATED: (data: { name: string; needTitle: string; otherPartyName: string; role: 'client' | 'technician' }) => ({
    subject: 'Nouvelle mission créée - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">Une nouvelle mission a été créée pour <strong>"${data.needTitle}"</strong>.</p>
      ${infoBox(`${row(data.role === 'client' ? 'Technicien' : 'Client', data.otherPartyName)}`)}
      <p style="color: #374151;">Consultez les détails de la mission dans l'application.</p>
      ${btn('#', 'Voir la mission')}
    `),
  }),

  MISSION_SCHEDULED: (data: { clientName: string; technicianName: string; needTitle: string; date: string; time?: string }) => ({
    subject: 'Mission planifiée - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.clientName},</h2>
      <p style="color: #374151;">La mission <strong>"${data.needTitle}"</strong> a été planifiée par <strong>${data.technicianName}</strong>.</p>
      ${infoBox(`
        ${row('Date', data.date)}
        ${data.time ? row('Heure', data.time) : ''}
      `)}
    `),
  }),

  MISSION_STARTED: (data: { clientName: string; technicianName: string; needTitle: string }) => ({
    subject: 'Mission démarrée - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.clientName},</h2>
      <p style="color: #374151;">La mission <strong>"${data.needTitle}"</strong> a été démarrée par <strong>${data.technicianName}</strong>.</p>
      <p style="color: #374151;">Vous serez informé à chaque étape de la progression.</p>
    `),
  }),

  MISSION_VALIDATION_REQUESTED: (data: { clientName: string; technicianName: string; needTitle: string }) => ({
    subject: 'Validation requise — Mission terminée - AlloTech',
    html: wrap('#fab829', `
      <h2 style="color: #111827;">Bonjour ${data.clientName},</h2>
      <p style="color: #374151;"><strong>${data.technicianName}</strong> a terminé la mission <strong>"${data.needTitle}"</strong> et demande votre validation.</p>
      <p style="color: #374151;">Vérifiez que les travaux ont été réalisés correctement et validez la mission.</p>
      ${btn('#', 'Valider la mission', '#fab829')}
    `),
  }),

  MISSION_COMPLETED: (data: { name: string; needTitle: string }) => ({
    subject: 'Mission terminée - AlloTech',
    html: wrap('#5bc288', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">La mission <strong>"${data.needTitle}"</strong> a été complétée avec succès !</p>
      <p style="color: #374151;">Les deux parties ont validé. Merci pour votre confiance.</p>
    `),
  }),

  MISSION_CANCELLED: (data: { name: string; needTitle: string; reason?: string; cancelledBy: string }) => ({
    subject: 'Mission annulée - AlloTech',
    html: wrap('#dc2626', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">La mission <strong>"${data.needTitle}"</strong> a été annulée par le <strong>${data.cancelledBy}</strong>.</p>
      ${data.reason ? `<p style="color: #374151;"><strong>Raison :</strong> ${data.reason}</p>` : ''}
    `),
  }),

  ADDITIONAL_QUOTATION: (data: { clientName: string; technicianName: string; needTitle: string; totalCost: string }) => ({
    subject: 'Devis additionnel reçu - AlloTech',
    html: wrap('#fab829', `
      <h2 style="color: #111827;">Bonjour ${data.clientName},</h2>
      <p style="color: #374151;"><strong>${data.technicianName}</strong> a soumis un devis additionnel pour la mission <strong>"${data.needTitle}"</strong>.</p>
      ${infoBox(`${row('Montant', `${data.totalCost} XAF`)}`)}
      <p style="color: #374151;">Consultez et répondez au devis dans l'application.</p>
      ${btn('#', 'Voir le devis', '#fab829')}
    `),
  }),

  // ── Payments ────────────────────────────────
  PAYMENT_RECEIVED: (data: { name: string; amount: string; currency: string; transactionId: string; date: string }) => ({
    subject: 'Paiement reçu - AlloTech',
    html: wrap('#5bc288', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">Nous avons bien reçu votre paiement !</p>
      ${infoBox(`
        ${row('Montant', `${data.amount} ${data.currency}`)}
        ${row('Transaction', data.transactionId)}
        ${row('Date', data.date)}
      `)}
      <p style="color: #374151;">Merci pour votre confiance !</p>
    `),
  }),

  // ── Licenses ────────────────────────────────
  LICENSE_ACTIVATED: (data: { name: string; plan: string; startDate: string; endDate: string }) => ({
    subject: 'Licence activée - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">Votre licence a été activée avec succès !</p>
      ${infoBox(`
        ${row('Plan', data.plan)}
        ${row('Début', data.startDate)}
        ${row('Fin', data.endDate)}
      `)}
    `),
  }),

  LICENSE_EXPIRING: (data: { name: string; plan: string; expiryDate: string; daysRemaining: number }) => ({
    subject: 'Votre licence expire bientôt - AlloTech',
    html: wrap('#fab829', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">Votre licence <strong>${data.plan}</strong> expire dans <strong>${data.daysRemaining} jours</strong> (${data.expiryDate}).</p>
      <p style="color: #374151;">Renouvelez maintenant pour continuer à profiter de toutes les fonctionnalités.</p>
      ${btn('#', 'Renouveler ma licence', '#fab829')}
    `),
  }),

  LICENSE_EXPIRED: (data: { name: string; plan: string }) => ({
    subject: 'Votre licence a expiré - AlloTech',
    html: wrap('#dc2626', `
      <h2 style="color: #111827;">Bonjour ${data.name},</h2>
      <p style="color: #374151;">Votre licence <strong>${data.plan}</strong> a expiré.</p>
      <p style="color: #374151;">Renouvelez maintenant pour retrouver l'accès à toutes les fonctionnalités.</p>
      ${btn('#', 'Renouveler ma licence')}
    `),
  }),

  // ── Ratings ─────────────────────────────────
  NEW_RATING: (data: { technicianName: string; clientName: string; score: number; comment?: string }) => ({
    subject: 'Nouvel avis reçu - AlloTech',
    html: wrap('#167bda', `
      <h2 style="color: #111827;">Bonjour ${data.technicianName},</h2>
      <p style="color: #374151;"><strong>${data.clientName}</strong> vous a laissé un avis !</p>
      ${infoBox(`
        ${row('Note', '⭐'.repeat(data.score) + ` (${data.score}/5)`)}
        ${data.comment ? row('Commentaire', data.comment) : ''}
      `)}
    `),
  }),
};

// ==========================================
// MAIL SERVICE
// ==========================================

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;
  private fromEmail: string;
  private isEnabled: boolean;
  private frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail = this.configService.get<string>('MAIL_FROM', 'AlloTech <noreply@allotech.com>');
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
    this.isEnabled = !!apiKey && apiKey !== 're_xxxxx';

    if (this.isEnabled) {
      this.resend = new Resend(apiKey);
      this.logger.log('Mail service initialized with Resend');
    } else {
      this.logger.warn('Mail service disabled - RESEND_API_KEY not configured');
    }
  }

  // ==========================================
  // CORE SEND METHOD
  // ==========================================

  async send(options: EmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.isEnabled) {
      this.logger.warn(`Mail not sent (disabled): ${options.subject} to ${options.to}`);
      return { success: false, error: 'Mail service disabled' };
    }

    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
      });

      this.logger.log(`Email sent: ${options.subject} to ${options.to}`);
      return { success: true, id: result.data?.id };
    } catch (error) {
      this.logger.error(`Failed to send email: ${(error as any).message}`, (error as any).stack);
      return { success: false, error: (error as any).message };
    }
  }

  // ==========================================
  // AUTH TEMPLATES
  // ==========================================

  async sendEmailVerification(to: string, name: string, token: string) {
    const verificationUrl = `${this.frontendUrl}/verifier-email/${token}`;
    const template = TEMPLATES.EMAIL_VERIFICATION({ name, verificationUrl });
    return this.send({ to, ...template });
  }

  async sendPasswordReset(to: string, name: string, token: string) {
    const resetUrl = `${this.frontendUrl}/reinitialiser-mot-de-passe?token=${token}`;
    const template = TEMPLATES.PASSWORD_RESET({ name, resetUrl });
    return this.send({ to, ...template });
  }

  async sendWelcome(to: string, name: string, role: string) {
    const template = TEMPLATES.WELCOME({ name, role });
    return this.send({ to, ...template });
  }

  // ==========================================
  // APPOINTMENT TEMPLATES
  // ==========================================

  async sendAppointmentCreated(to: string, data: { technicianName: string; clientName: string; needTitle: string; date: string; time: string; address: string }) {
    const template = TEMPLATES.APPOINTMENT_CREATED(data);
    return this.send({ to, ...template });
  }

  async sendAppointmentConfirmed(to: string, data: { clientName: string; technicianName: string; date: string; time: string; address: string }) {
    const template = TEMPLATES.APPOINTMENT_CONFIRMED(data);
    return this.send({ to, ...template });
  }

  async sendAppointmentCancelled(to: string, data: { name: string; date: string; time: string; reason?: string; cancelledBy: string }) {
    const template = TEMPLATES.APPOINTMENT_CANCELLED(data);
    return this.send({ to, ...template });
  }

  async sendAppointmentStarted(to: string, data: { clientName: string; technicianName: string }) {
    const template = TEMPLATES.APPOINTMENT_STARTED(data);
    return this.send({ to, ...template });
  }

  async sendAppointmentCompleted(to: string, data: { clientName: string; technicianName: string }) {
    const template = TEMPLATES.APPOINTMENT_COMPLETED(data);
    return this.send({ to, ...template });
  }

  // ==========================================
  // CANDIDATURE TEMPLATES
  // ==========================================

  async sendNewCandidature(to: string, data: { clientName: string; technicianName: string; needTitle: string; message?: string; proposedPrice?: number }) {
    const template = TEMPLATES.NEW_CANDIDATURE(data);
    return this.send({ to, ...template });
  }

  async sendCandidatureAccepted(to: string, data: { technicianName: string; needTitle: string; clientName: string; date?: string; time?: string }) {
    const template = TEMPLATES.CANDIDATURE_ACCEPTED(data);
    return this.send({ to, ...template });
  }

  async sendCandidatureRejected(to: string, data: { technicianName: string; needTitle: string }) {
    const template = TEMPLATES.CANDIDATURE_REJECTED(data);
    return this.send({ to, ...template });
  }

  // ==========================================
  // QUOTATION TEMPLATES
  // ==========================================

  async sendNewQuotation(to: string, data: { clientName: string; technicianName: string; needTitle: string; totalCost: string; currency: string; signingUrl?: string }) {
    const template = TEMPLATES.NEW_QUOTATION(data);
    return this.send({ to, ...template });
  }

  async sendQuotationAccepted(to: string, data: { technicianName: string; needTitle: string; totalCost: string; currency: string }) {
    const template = TEMPLATES.QUOTATION_ACCEPTED(data);
    return this.send({ to, ...template });
  }

  async sendQuotationRejected(to: string, data: { technicianName: string; needTitle: string; reason?: string }) {
    const template = TEMPLATES.QUOTATION_REJECTED(data);
    return this.send({ to, ...template });
  }

  // ==========================================
  // MISSION TEMPLATES
  // ==========================================

  async sendMissionCreated(to: string, data: { name: string; needTitle: string; otherPartyName: string; role: 'client' | 'technician' }) {
    const template = TEMPLATES.MISSION_CREATED(data);
    return this.send({ to, ...template });
  }

  async sendMissionScheduled(to: string, data: { clientName: string; technicianName: string; needTitle: string; date: string; time?: string }) {
    const template = TEMPLATES.MISSION_SCHEDULED(data);
    return this.send({ to, ...template });
  }

  async sendMissionStarted(to: string, data: { clientName: string; technicianName: string; needTitle: string }) {
    const template = TEMPLATES.MISSION_STARTED(data);
    return this.send({ to, ...template });
  }

  async sendMissionValidationRequested(to: string, data: { clientName: string; technicianName: string; needTitle: string }) {
    const template = TEMPLATES.MISSION_VALIDATION_REQUESTED(data);
    return this.send({ to, ...template });
  }

  async sendMissionCompleted(to: string, data: { name: string; needTitle: string }) {
    const template = TEMPLATES.MISSION_COMPLETED(data);
    return this.send({ to, ...template });
  }

  async sendMissionCancelled(to: string, data: { name: string; needTitle: string; reason?: string; cancelledBy: string }) {
    const template = TEMPLATES.MISSION_CANCELLED(data);
    return this.send({ to, ...template });
  }

  async sendAdditionalQuotation(to: string, data: { clientName: string; technicianName: string; needTitle: string; totalCost: string }) {
    const template = TEMPLATES.ADDITIONAL_QUOTATION(data);
    return this.send({ to, ...template });
  }

  // ==========================================
  // PAYMENT TEMPLATES
  // ==========================================

  async sendPaymentReceived(to: string, data: { name: string; amount: string; currency: string; transactionId: string; date: string }) {
    const template = TEMPLATES.PAYMENT_RECEIVED(data);
    return this.send({ to, ...template });
  }

  // ==========================================
  // LICENSE TEMPLATES
  // ==========================================

  async sendLicenseActivated(to: string, data: { name: string; plan: string; startDate: string; endDate: string }) {
    const template = TEMPLATES.LICENSE_ACTIVATED(data);
    return this.send({ to, ...template });
  }

  async sendLicenseExpiring(to: string, data: { name: string; plan: string; expiryDate: string; daysRemaining: number }) {
    const template = TEMPLATES.LICENSE_EXPIRING(data);
    return this.send({ to, ...template });
  }

  async sendLicenseExpired(to: string, data: { name: string; plan: string }) {
    const template = TEMPLATES.LICENSE_EXPIRED(data);
    return this.send({ to, ...template });
  }

  // ==========================================
  // RATING TEMPLATES
  // ==========================================

  async sendNewRating(to: string, data: { technicianName: string; clientName: string; score: number; comment?: string }) {
    const template = TEMPLATES.NEW_RATING(data);
    return this.send({ to, ...template });
  }
}
