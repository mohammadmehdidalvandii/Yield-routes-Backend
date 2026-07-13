import { AppError, requestId, errorHandler } from '../../middleware/errors';

jest.mock('../../logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('errors middleware', () => {
  const mockResponse = () => {
    const res: any = {};

    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn();

    return res;
  };

  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AppError', () => {
    it('should create an AppError instance', () => {
      const error = new AppError(
        404,
        'NOT_FOUND',
        'Resource not found',
        'User does not exist',
      );

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Resource not found');
      expect(error.detail).toBe('User does not exist');
      expect(error.name).toBe('AppError');
    });
  });

  describe('requestId', () => {
    it('should generate request id when header is missing', () => {
      const req: any = {
        headers: {},
      };

      const res = mockResponse();

      requestId(req, res, next);

      expect(req.headers['x-request-id']).toBeDefined();

      expect(res.setHeader).toHaveBeenCalledWith(
        'x-request-id',
        req.headers['x-request-id'],
      );

      expect(next).toHaveBeenCalled();
    });

    it('should reuse existing request id', () => {
      const req: any = {
        headers: {
          'x-request-id': 'existing-request-id',
        },
      };

      const res = mockResponse();

      requestId(req, res, next);

      expect(req.headers['x-request-id']).toBe('existing-request-id');

      expect(res.setHeader).toHaveBeenCalledWith(
        'x-request-id',
        'existing-request-id',
      );

      expect(next).toHaveBeenCalled();
    });
  });

  describe('errorHandler', () => {
    it('should handle AppError', () => {
      const err = new AppError(
        400,
        'BAD_REQUEST',
        'Validation failed',
        'Invalid input',
      );

      const req: any = {
        headers: {
          'x-request-id': 'req-123',
        },
      };

      const res = mockResponse();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'BAD_REQUEST',
        detail: 'Invalid input',
        requestId: 'req-123',
      });
    });

    it('should handle unexpected errors', () => {
      const err = new Error('Something went wrong');

      const req: any = {
        headers: {
          'x-request-id': 'req-456',
        },
      };

      const res = mockResponse();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        requestId: 'req-456',
      });
    });
  });
});