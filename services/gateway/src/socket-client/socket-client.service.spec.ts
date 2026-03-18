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
      code: '0',
      error: '',
      routes: [],
      unassigned: [],
      routingDistance: '0',
      routingDuration: '0',
    };

    expect(() => service.emitRouteUpdate('traffic_jam', mockRoutes)).toThrow(
      'Socket.io server not connected',
    );
  });
});
