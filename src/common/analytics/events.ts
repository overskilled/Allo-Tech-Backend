/**
 * Allô Tech — analytics event contract (single source of truth).
 *
 * This file is mirrored verbatim across the three repos (backend, web, mobile)
 * until it is extracted into a shared `@allotech/analytics` package. Keep them
 * in sync.
 *
 * Naming convention:
 *   - server "facts" use past tense:        need_created, payment_succeeded
 *   - client "intent/friction" use a suffix: _started / _clicked / _failed / _viewed
 *
 * The success of a state transition is emitted ONCE, by the backend. Clients
 * only emit the intent that precedes it (so we can measure the drop-off).
 * Add every new event here (with a comment) before using it anywhere.
 */
export const ANALYTICS_EVENTS = {
  // ── Auth & onboarding (server facts) ──────────────────────────────────────
  USER_REGISTERED: 'user_registered',
  USER_LOGGED_IN: 'user_logged_in',
  OAUTH_SIGNUP: 'oauth_signup',
  EMAIL_VERIFIED: 'email_verified',
  ROLE_SELECTED: 'role_selected',
  PROFILE_COMPLETED: 'profile_completed',
  USER_SUSPENDED: 'user_suspended',

  // ── Auth & onboarding (client intent) ─────────────────────────────────────
  SIGNUP_CTA_CLICKED: 'signup_cta_clicked',
  LOGIN_STARTED: 'login_started',
  LOGIN_FAILED: 'login_failed',
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_FAILED: 'signup_failed',

  // ── Needs (demand) ────────────────────────────────────────────────────────
  NEED_CREATE_STARTED: 'need_create_started', // client
  NEED_CREATED: 'need_created',
  NEED_IN_PROGRESS: 'need_in_progress',
  NEED_COMPLETED: 'need_completed',
  NEED_CANCELLED: 'need_cancelled',
  NEED_RESTORED: 'need_restored',

  // ── Candidatures (supply → demand match) ─────────────────────────────────
  CANDIDATURE_CREATED: 'candidature_created',
  CANDIDATURE_ACCEPTED: 'candidature_accepted',
  CANDIDATURE_AUTO_ACCEPTED: 'candidature_auto_accepted',
  CANDIDATURE_REJECTED: 'candidature_rejected',
  CANDIDATURE_WITHDRAWN: 'candidature_withdrawn',

  // ── Quotations ────────────────────────────────────────────────────────────
  QUOTATION_SUBMIT_CLICKED: 'quotation_submit_clicked', // client
  QUOTATION_CREATED: 'quotation_created',
  QUOTATION_SENT: 'quotation_sent',
  QUOTATION_ACCEPTED: 'quotation_accepted',
  QUOTATION_REJECTED: 'quotation_rejected',
  QUOTATION_COUNTER_PROPOSED: 'quotation_counter_proposed',
  QUOTATION_SIGNED: 'quotation_signed',
  QUOTATION_EXPIRED: 'quotation_expired',

  // ── Missions ──────────────────────────────────────────────────────────────
  MISSION_CREATED: 'mission_created',
  MISSION_SCHEDULED: 'mission_scheduled',
  MISSION_STARTED: 'mission_started',
  MISSION_COMPLETION_REQUESTED: 'mission_completion_requested',
  MISSION_COMPLETED: 'mission_completed',
  MISSION_DISPUTED: 'mission_disputed',
  MISSION_CANCELLED: 'mission_cancelled',

  // ── Appointments ──────────────────────────────────────────────────────────
  APPOINTMENT_CREATED: 'appointment_created',
  APPOINTMENT_CONFIRMED: 'appointment_confirmed',
  APPOINTMENT_STARTED: 'appointment_started',
  APPOINTMENT_COMPLETED: 'appointment_completed',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  APPOINTMENT_NO_SHOW: 'appointment_no_show',

  // ── Payments & revenue ────────────────────────────────────────────────────
  PAYMENT_CHECKOUT_STARTED: 'payment_checkout_started', // client intent
  PAYMENT_INITIATED: 'payment_initiated', // server
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_EXPIRED: 'payment_expired',

  // ── Licenses (subscription) ───────────────────────────────────────────────
  TRIAL_STARTED: 'trial_started',
  LICENSE_ACTIVATED: 'license_activated',
  LICENSE_RENEWED: 'license_renewed',
  LICENSE_EXPIRED: 'license_expired',
  LICENSE_CANCELLED: 'license_cancelled',

  // ── KYC (supply quality gate) ─────────────────────────────────────────────
  KYC_DRAFT_STARTED: 'kyc_draft_started',
  KYC_SUBMITTED: 'kyc_submitted',
  KYC_REVIEW_STARTED: 'kyc_review_started',
  KYC_APPROVED: 'kyc_approved',
  KYC_REJECTED: 'kyc_rejected',
  KYC_RESUBMISSION_REQUIRED: 'kyc_resubmission_required',

  // ── Ratings ───────────────────────────────────────────────────────────────
  RATING_CREATED: 'rating_created',

  // ── Chantiers (projects) ──────────────────────────────────────────────────
  CHANTIER_CREATED: 'chantier_created',
  CHANTIER_MEMBER_INVITED: 'chantier_member_invited',
  CHANTIER_MEMBER_ACCEPTED: 'chantier_member_accepted',
  CHANTIER_MEMBER_DECLINED: 'chantier_member_declined',
  CHANTIER_PHASE_COMPLETED: 'chantier_phase_completed',
  CHANTIER_EXPENSE_ADDED: 'chantier_expense_added',

  // ── Messaging & support ───────────────────────────────────────────────────
  MESSAGE_SENT: 'message_sent',
  SUPPORT_TICKET_CREATED: 'support_ticket_created',

  // ── Technician discovery (client) ─────────────────────────────────────────
  TECHNICIAN_SEARCH_PERFORMED: 'technician_search_performed',
  TECHNICIAN_PROFILE_VIEWED: 'technician_profile_viewed',
  TECHNICIAN_FAVORITED: 'technician_favorited',
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Stable platform tag attached to every event as a super-property. */
export type AnalyticsPlatform = 'web' | 'mobile' | 'backend';
