import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SocketClientService } from './socket-client.service';

describe('SocketClientService', () => {
  let service: SocketClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocketClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => defaultValue),
          },
        },
      ],
    }).compile();

    service = module.get<SocketClientService>(SocketClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should report disconnected before init', () => {
    expect(service.isConnected()).toBe(false);
  });

  it('should throw when emitting while disconnected', () => {
    const mockRoutes = {
      routes: [],
      totalCost: 0,
      solvedAt: '2026-03-06T00:00:00.000Z',
    };

    expect(() => service.emitRouteUpdate('traffic_jam', mockRoutes)).toThrow(
      'Socket.io server not connected',
    );
  });
});
