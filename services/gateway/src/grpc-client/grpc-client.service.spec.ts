import { Test, TestingModule } from '@nestjs/testing';
import { GrpcClientService } from './grpc-client.service';

describe('GrpcClientService', () => {
  let service: GrpcClientService;

  const mockGrpcClient = {
    getService: jest.fn().mockReturnValue({
      optimizeRoutes: jest.fn().mockReturnValue({
        toPromise: jest.fn(),
      }),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrpcClientService,
        {
          provide: 'ROUTE_OPTIMIZER_PACKAGE',
          useValue: mockGrpcClient,
        },
      ],
    }).compile();

    service = module.get<GrpcClientService>(GrpcClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize gRPC service on module init', () => {
    service.onModuleInit();
    expect(mockGrpcClient.getService).toHaveBeenCalledWith('RouteOptimizer');
  });
});
