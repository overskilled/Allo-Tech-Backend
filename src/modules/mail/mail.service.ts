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

export interface EmailTemplateData {
  [key: string]: any;
}

// Email templates
const TEMPLATES = {
  // Authentication
  EMAIL_VERIFICATION: (data: { name: string; verificationUrl: string }) => ({
    subject: 'Vérifiez votre adresse email - AlloTech',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bonjour ${data.name},</h2>
          <p>Merci de vous être inscrit sur AlloTech. Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.verificationUrl}" style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Vérifier mon email</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Ce lien expire dans 24 heures.</p>
          <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas créé de compte, ignorez cet email.</p>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),

  PASSWORD_RESET: (data: { name: string; resetUrl: string }) => ({
    subject: 'Réinitialisation de mot de passe - AlloTech',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bonjour ${data.name},</h2>
          <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.resetUrl}" style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Réinitialiser mon mot de passe</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Ce lien expire dans 1 heure.</p>
          <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),

  // Appointments
  APPOINTMENT_CONFIRMED: (data: {
    clientName: string;
    technicianName: string;
    date: string;
    time: string;
    address: string;
  }) => ({
    subject: 'Rendez-vous confirmé - AlloTech',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bonjour ${data.clientName},</h2>
          <p>Votre rendez-vous a été confirmé avec succès!</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Technicien:</strong> ${data.technicianName}</p>
            <p><strong>Date:</strong> ${data.date}</p>
            <p><strong>Heure:</strong> ${data.time}</p>
            <p><strong>Adresse:</strong> ${data.address}</p>
          </div>
          <p>Le technicien vous contactera pour confirmer les détails.</p>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),

  APPOINTMENT_CANCELLED: (data: { name: string; date: string; time: string; reason?: string }) => ({
    subject: 'Rendez-vous annulé - AlloTech',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bonjour ${data.name},</h2>
          <p>Votre rendez-vous prévu le ${data.date} à ${data.time} a été annulé.</p>
          ${data.reason ? `<p><strong>Raison:</strong> ${data.reason}</p>` : ''}
          <p>Vous pouvez créer un nouveau rendez-vous depuis l'application.</p>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),

  // Quotations
  NEW_QUOTATION: (data: {
    clientName: string;
    technicianName: string;
    needTitle: string;
    totalCost: string;
    currency: string;
  }) => ({
    subject: 'Nouveau devis reçu - AlloTech',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bonjour ${data.clientName},</h2>
          <p>Vous avez reçu un nouveau devis!</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Demande:</strong> ${data.needTitle}</p>
            <p><strong>Technicien:</strong> ${data.technicianName}</p>
            <p><strong>Montant total:</strong> ${data.totalCost} ${data.currency}</p>
          </div>
          <p>Connectez-vous à l'application pour consulter les détails et répondre.</p>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),

  // Payments
  PAYMENT_RECEIVED: (data: {
    name: string;
    amount: string;
    currency: string;
    transactionId: string;
    date: string;
  }) => ({
    subject: 'Paiement reçu - AlloTech',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #16a34a; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bonjour ${data.name},</h2>
          <p>Nous avons bien reçu votre paiement!</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Montant:</strong> ${data.amount} ${data.currency}</p>
            <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
            <p><strong>Date:</strong> ${data.date}</p>
          </div>
          <p>Merci pour votre confiance!</p>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),

  // License
  LICENSE_ACTIVATED: (data: {
    name: string;
    plan: string;
    startDate: string;
    endDate: string;
  }) => ({
    subject: 'Licence activée - AlloTech',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bonjour ${data.name},</h2>
          <p>Votre licence a été activée avec succès!</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Plan:</strong> ${data.plan}</p>
            <p><strong>Date de début:</strong> ${data.startDate}</p>
            <p><strong>Date de fin:</strong> ${data.endDate}</p>
          </div>
          <p>Profitez de toutes les fonctionnalités de votre compte!</p>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),

  LICENSE_EXPIRING: (data: {
    name: string;
    plan: string;
    expiryDate: string;
    daysRemaining: number;
  }) => ({
    subject: 'Votre licence expire bientôt - AlloTech',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f59e0b; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bonjour ${data.name},</h2>
          <p>Votre licence ${data.plan} expire dans ${data.daysRemaining} jours (${data.expiryDate}).</p>
          <p>Renouvelez maintenant pour continuer à profiter de toutes les fonctionnalités.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Renouveler ma licence</a>
          </div>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),

  LICENSE_EXPIRED: (data: { name: string; plan: string }) => ({
    subject: 'Votre licence a expiré - AlloTech',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bonjour ${data.name},</h2>
          <p>Votre licence ${data.plan} a expiré.</p>
          <p>Renouvelez maintenant pour retrouver l'accès à toutes les fonctionnalités.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Renouveler ma licence</a>
          </div>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),

  // Welcome
  WELCOME: (data: { name: string; role: string }) => ({
    subject: 'Bienvenue sur AlloTech!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">AlloTech</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2>Bienvenue ${data.name}!</h2>
          <p>Nous sommes ravis de vous accueillir sur AlloTech.</p>
          ${
            data.role === 'TECHNICIAN'
              ? `
            <p>En tant que technicien, vous pouvez maintenant:</p>
            <ul>
              <li>Consulter les demandes de clients</li>
              <li>Soumettre des candidatures</li>
              <li>Gérer vos rendez-vous</li>
              <li>Créer des devis</li>
              <li>Présenter vos réalisations</li>
            </ul>
          `
              : `
            <p>En tant que client, vous pouvez maintenant:</p>
            <ul>
              <li>Publier vos besoins</li>
              <li>Trouver des techniciens qualifiés</li>
              <li>Prendre des rendez-vous</li>
              <li>Recevoir des devis</li>
              <li>Évaluer les prestations</li>
            </ul>
          `
          }
          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Accéder à mon compte</a>
          </div>
        </div>
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 AlloTech. Tous droits réservés.</p>
        </div>
      </div>
    `,
  }),
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;
  private fromEmail: string;
  private isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail = this.configService.get<string>('MAIL_FROM', 'AlloTech <noreply@allotech.com>');
    this.isEnabled = !!apiKey;

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
  // TEMPLATE METHODS
  // ==========================================

  async sendEmailVerification(to: string, name: string, verificationUrl: string) {
    const template = TEMPLATES.EMAIL_VERIFICATION({ name, verificationUrl });
    return this.send({ to, ...template });
  }

  async sendPasswordReset(to: string, name: string, resetUrl: string) {
    const template = TEMPLATES.PASSWORD_RESET({ name, resetUrl });
    return this.send({ to, ...template });
  }

  async sendWelcome(to: string, name: string, role: string) {
    const template = TEMPLATES.WELCOME({ name, role });
    return this.send({ to, ...template });
  }

  async sendAppointmentConfirmed(
    to: string,
    data: {
      clientName: string;
      technicianName: string;
      date: string;
      time: string;
      address: string;
    }
  ) {
    const template = TEMPLATES.APPOINTMENT_CONFIRMED(data);
    return this.send({ to, ...template });
  }

  async sendAppointmentCancelled(
    to: string,
    data: { name: string; date: string; time: string; reason?: string }
  ) {
    const template = TEMPLATES.APPOINTMENT_CANCELLED(data);
    return this.send({ to, ...template });
  }

  async sendNewQuotation(
    to: string,
    data: {
      clientName: string;
      technicianName: string;
      needTitle: string;
      totalCost: string;
      currency: string;
    }
  ) {
    const template = TEMPLATES.NEW_QUOTATION(data);
    return this.send({ to, ...template });
  }

  async sendPaymentReceived(
    to: string,
    data: {
      name: string;
      amount: string;
      currency: string;
      transactionId: string;
      date: string;
    }
  ) {
    const template = TEMPLATES.PAYMENT_RECEIVED(data);
    return this.send({ to, ...template });
  }

  async sendLicenseActivated(
    to: string,
    data: { name: string; plan: string; startDate: string; endDate: string }
  ) {
    const template = TEMPLATES.LICENSE_ACTIVATED(data);
    return this.send({ to, ...template });
  }

  async sendLicenseExpiring(
    to: string,
    data: { name: string; plan: string; expiryDate: string; daysRemaining: number }
  ) {
    const template = TEMPLATES.LICENSE_EXPIRING(data);
    return this.send({ to, ...template });
  }

  async sendLicenseExpired(to: string, data: { name: string; plan: string }) {
    const template = TEMPLATES.LICENSE_EXPIRED(data);
    return this.send({ to, ...template });
  }
}
