/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  jest.setTimeout(15000);

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        username: process.env.AUTH_DEMO_USERNAME ?? 'demo',
        password: process.env.AUTH_DEMO_PASSWORD ?? 'demo123',
      })
      .expect(200);

    accessToken = loginResponse.body.accessToken as string;
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('logiflow-core-backend');
      });
  });

  describe('Webhook (e2e)', () => {
    const validPayload = {
      eventType: 'traffic_jam',
      vehicles: [{ id: 'v1', lat: 4.711, lng: -74.0721, capacity: 100 }],
      stops: [{ id: 's1', lat: 4.6097, lng: -74.0817, demand: 20 }],
    };

    it('/api/v1/webhook (POST) should reject when missing bearer token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/webhook')
        .send(validPayload)
        .expect(401);
    });

    it('/api/v1/webhook (POST) should accept valid event', () => {
      return request(app.getHttpServer())
        .post('/api/v1/webhook')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validPayload)
        .expect(201)
        .then((res) => {
          expect(res.body.received).toBe(true);
          expect(res.body.eventType).toBe('traffic_jam');
          expect(res.body.vehicleCount).toBe(1);
          expect(res.body.stopCount).toBe(1);
        });
    });

    it('/api/v1/webhook (POST) should reject invalid eventType', () => {
      return request(app.getHttpServer())
        .post('/api/v1/webhook')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...validPayload, eventType: 'invalid_event' })
        .expect(400);
    });

    it('/api/v1/webhook (POST) should reject empty vehicles', () => {
      return request(app.getHttpServer())
        .post('/api/v1/webhook')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...validPayload, vehicles: [] })
        .expect(400);
    });

    it('/api/v1/webhook (POST) should reject missing body', () => {
      return request(app.getHttpServer())
        .post('/api/v1/webhook')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('Vehicles CRUD (e2e)', () => {
    it('GET /api/v1/vehicles should reject when missing bearer token', () => {
      return request(app.getHttpServer()).get('/api/v1/vehicles').expect(401);
    });

    it('GET /api/v1/vehicles should return empty array', () => {
      return request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual([]);
        });
    });

    it('POST /api/v1/vehicles should create a vehicle', () => {
      return request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lat: 4.711, lng: -74.072, capacity: 100 })
        .expect(201)
        .then((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.lat).toBe(4.711);
          expect(res.body.capacity).toBe(100);
        });
    });

    it('POST should reject invalid lat', () => {
      return request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lat: 200, lng: -74.072, capacity: 100 })
        .expect(400);
    });

    it('GET /api/v1/vehicles/:id should return a vehicle', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: 'v-test', lat: 4.711, lng: -74.072, capacity: 100 });

      return request(app.getHttpServer())
        .get(`/api/v1/vehicles/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body.id).toBe('v-test');
        });
    });

    it('GET /api/v1/vehicles/:id should 404 for unknown', () => {
      return request(app.getHttpServer())
        .get('/api/v1/vehicles/unknown')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('PUT /api/v1/vehicles/:id should update', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: 'v-upd', lat: 4.711, lng: -74.072, capacity: 100 });

      return request(app.getHttpServer())
        .put('/api/v1/vehicles/v-upd')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ capacity: 250 })
        .expect(200)
        .then((res) => {
          expect(res.body.capacity).toBe(250);
          expect(res.body.lat).toBe(4.711);
        });
    });

    it('DELETE /api/v1/vehicles/:id should remove', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: 'v-del', lat: 4.711, lng: -74.072, capacity: 100 });

      await request(app.getHttpServer())
        .delete('/api/v1/vehicles/v-del')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      return request(app.getHttpServer())
        .get('/api/v1/vehicles/v-del')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('Stops CRUD (e2e)', () => {
    it('GET /api/v1/stops should reject when missing bearer token', () => {
      return request(app.getHttpServer()).get('/api/v1/stops').expect(401);
    });

    it('GET /api/v1/stops should return empty array', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stops')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual([]);
        });
    });

    it('POST /api/v1/stops should create a stop', () => {
      return request(app.getHttpServer())
        .post('/api/v1/stops')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lat: 4.609, lng: -74.081, demand: 20 })
        .expect(201)
        .then((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.demand).toBe(20);
          expect(res.body.priority).toBe(0);
        });
    });

    it('POST should reject negative demand', () => {
      return request(app.getHttpServer())
        .post('/api/v1/stops')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lat: 4.609, lng: -74.081, demand: -5 })
        .expect(400);
    });

    it('GET /api/v1/stops/:id should return a stop', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/stops')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: 's-test', lat: 4.609, lng: -74.081, demand: 20 });

      return request(app.getHttpServer())
        .get(`/api/v1/stops/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body.id).toBe('s-test');
        });
    });

    it('GET /api/v1/stops/:id should 404 for unknown', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stops/unknown')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('PUT /api/v1/stops/:id should update', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/stops')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: 's-upd', lat: 4.609, lng: -74.081, demand: 20 });

      return request(app.getHttpServer())
        .put('/api/v1/stops/s-upd')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ demand: 50, priority: 3 })
        .expect(200)
        .then((res) => {
          expect(res.body.demand).toBe(50);
          expect(res.body.priority).toBe(3);
        });
    });

    it('DELETE /api/v1/stops/:id should remove', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/stops')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: 's-del', lat: 4.609, lng: -74.081, demand: 20 });

      await request(app.getHttpServer())
        .delete('/api/v1/stops/s-del')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      return request(app.getHttpServer())
        .get('/api/v1/stops/s-del')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
