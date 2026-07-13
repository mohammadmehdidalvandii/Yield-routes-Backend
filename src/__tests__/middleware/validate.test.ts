import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';

describe('validate middleware', () => {
  const mockResponse = () => {
    const res: any = {};

    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);

    return res;
  };

  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBody', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    it('should call next when body is valid', () => {
      const middleware = validateBody(schema);

      const req: any = {
        body: {
          name: 'Mohammad',
          age: 25,
        },
      };

      const res = mockResponse();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.body).toEqual({
        name: 'Mohammad',
        age: 25,
      });
    });

    it('should return 400 when body is invalid', () => {
      const middleware = validateBody(schema);

      const req: any = {
        body: {
          name: 'Mohammad',
          age: '25',
        },
      };

      const res = mockResponse();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(400);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          details: expect.any(Object),
        }),
      );
    });
  });

  describe('validateParams', () => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    it('should call next when params are valid', () => {
      const middleware = validateParams(schema);

      const req: any = {
        params: {
          id: '550e8400-e29b-41d4-a716-446655440000',
        },
      };

      const res = mockResponse();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 when params are invalid', () => {
      const middleware = validateParams(schema);

      const req: any = {
        params: {
          id: 'invalid-id',
        },
      };

      const res = mockResponse();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(400);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid params',
      });
    });
  });

  describe('validateQuery', () => {
    const schema = z.object({
      page: z.coerce.number().min(1),
    });

    it('should call next when query is valid', () => {
      const middleware = validateQuery(schema);

      const req: any = {
        query: {
          page: '1',
        },
      };

      const res = mockResponse();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();

      expect(req.query).toEqual({
        page: 1,
      });
    });

    it('should return 400 when query is invalid', () => {
      const middleware = validateQuery(schema);

      const req: any = {
        query: {
          page: 'abc',
        },
      };

      const res = mockResponse();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(400);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid query',
      });
    });
  });
});