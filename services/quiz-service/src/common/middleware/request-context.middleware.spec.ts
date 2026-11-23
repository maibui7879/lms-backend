import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context.middleware';

describe('requestContext', () => {
  it('preserves a valid request ID and returns it in the response header', () => {
    const request = {
      headers: { 'x-request-id': 'client-request-42' },
    } as unknown as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    requestContext(request, response, next);

    expect(request.headers['x-request-id']).toBe('client-request-42');
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      'client-request-42',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('replaces an invalid request ID with a generated UUID', () => {
    const request = {
      headers: { 'x-request-id': 'bad request id' },
    } as unknown as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    requestContext(request, response, next);

    const requestId = request.headers['x-request-id'];
    expect(typeof requestId).toBe('string');
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
