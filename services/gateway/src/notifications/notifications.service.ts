import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

type DeviceTokenClient = {
  deviceToken: {
    upsert: (args: {
      where: { token: string };
      update: { userId: string; platform: string };
      create: { userId: string; token: string; platform: string };
    }) => Promise<unknown>;
    findMany: (args: {
      where: { userId: { in: string[] } };
      select: { token: true };
    }) => Promise<{ token: string }[]>;
    deleteMany: (args: {
      where: { token: { in: string[] } };
    }) => Promise<unknown>;
  };
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  onModuleInit() {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase not configured — push notifications disabled. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.',
      );
      return;
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
      this.firebaseInitialized = true;
      this.logger.log('Firebase Admin initialized for push notifications');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Firebase init failed: ${message}`);
    }
  }

  async registerDeviceToken(userId: string, token: string, platform: string) {
    const client = this.prismaService as unknown as DeviceTokenClient;
    await client.deviceToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
  }

  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!this.firebaseInitialized) {
      this.logger.warn('Firebase not initialized — skipping push notification');
      return { sent: 0, failed: 0 };
    }

    const client = this.prismaService as unknown as DeviceTokenClient;
    const devices = await client.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });

    if (devices.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const tokens = devices.map((d) => d.token);

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: data ?? {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'logiflow-routes',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });

    const failedTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        resp.error?.code === 'messaging/registration-token-not-registered'
      ) {
        failedTokens.push(tokens[idx]);
      }
    });

    if (failedTokens.length > 0) {
      await client.deviceToken.deleteMany({
        where: { token: { in: failedTokens } },
      });
    }

    this.logger.log(
      `Push sent: ${response.successCount} success, ${response.failureCount} failed`,
    );

    return { sent: response.successCount, failed: response.failureCount };
  }

  async sendRouteUpdate(
    vehicleId: string,
    userIds: string[],
    routeSummary: { stops: number; estimatedTime?: number },
  ) {
    return this.sendToUsers(
      userIds,
      'Route updated',
      `Your route for ${vehicleId} has been optimized with ${routeSummary.stops} stops.`,
      {
        type: 'route_update',
        vehicleId,
        stops: String(routeSummary.stops),
        estimatedTime: String(routeSummary.estimatedTime ?? 0),
      },
    );
  }
}
