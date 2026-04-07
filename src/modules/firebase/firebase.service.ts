import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initialize();
  }

  private initialize() {
    if (admin.apps.length > 0) {
      this.app = admin.apps[0]!;
      this.logger.log('Firebase Admin SDK reusing existing app');
      return;
    }

    try {
      const base64 = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_BASE64');

      if (base64) {
        // Production: decode from base64 env var (Dokploy)
        const json = Buffer.from(base64, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(json);
        this.app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: this.configService.get<string>('FIREBASE_STORAGE_BUCKET'),
        });
        this.logger.log('Firebase Admin SDK initialized from base64 env var');
      } else {
        // Development: load from file
        const keyPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
        if (!keyPath) {
          this.logger.warn('Firebase not configured (no FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_SERVICE_ACCOUNT_PATH)');
          return;
        }
        const absPath = path.resolve(process.cwd(), keyPath);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const serviceAccount = require(absPath);
        this.app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: this.configService.get<string>('FIREBASE_STORAGE_BUCKET'),
        });
        this.logger.log(`Firebase Admin SDK initialized from file: ${keyPath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize Firebase: ${(error as Error).message}`);
    }
  }

  get isInitialized(): boolean {
    return this.app !== null;
  }

  get messaging(): admin.messaging.Messaging {
    if (!this.app) throw new Error('Firebase not initialized');
    return this.app.messaging();
  }

  get storage(): admin.storage.Storage {
    if (!this.app) throw new Error('Firebase not initialized');
    return this.app.storage();
  }

  /**
   * Send push notifications to multiple device tokens.
   * Returns { successCount, failureCount, failedTokens }
   */
  async sendMulticast(
    tokens: string[],
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ): Promise<{ successCount: number; failureCount: number; failedTokens: string[] }> {
    if (!this.isInitialized || tokens.length === 0) {
      return { successCount: 0, failureCount: 0, failedTokens: [] };
    }

    // FCM sendMulticast accepts max 500 tokens at a time
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }

    let successCount = 0;
    let failureCount = 0;
    const failedTokens: string[] = [];

    for (const chunk of chunks) {
      const message: admin.messaging.MulticastMessage = {
        tokens: chunk,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: data
          ? Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)]),
            )
          : undefined,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'allotech_default',
          },
        },
        apns: {
          payload: {
            aps: { sound: 'default', badge: 1 },
          },
        },
      };

      try {
        const response = await this.messaging.sendEachForMulticast(message);
        successCount += response.successCount;
        failureCount += response.failureCount;
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(chunk[idx]);
          }
        });
      } catch (error) {
        this.logger.error(`FCM multicast error: ${(error as Error).message}`);
        failureCount += chunk.length;
      }
    }

    return { successCount, failureCount, failedTokens };
  }

  /**
   * Upload a buffer to Firebase Storage and return the public download URL.
   */
  async uploadFile(
    buffer: Buffer,
    destination: string,
    contentType: string,
  ): Promise<string> {
    if (!this.isInitialized) throw new Error('Firebase not initialized');

    const bucket = this.storage.bucket();
    const file = bucket.file(destination);

    const token = randomUUID();

    await file.save(buffer, {
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
      resumable: false,
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;
  }
}
