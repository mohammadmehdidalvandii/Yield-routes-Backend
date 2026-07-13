import { requireApiKey } from '../../middleware/auth';
import { config } from '../../config';

jest.mock('../../logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

describe('requireApiKey middleware', () => {
  const mockRequest = (headers = {}) => ({
    headers,
    path: '/test',
  } as any);

  const mockResponse = () => {
    const res: any = {};

    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);

    return res;
  };

  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });


  it('should call next when ADMIN_API_KEY is not configured', () => {
    Object.defineProperty(config, 'ADMIN_API_KEY', {
      value: '',
      writable: true,
    });

    const req = mockRequest();
    const res = mockResponse();
    const next = mockNext;

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });


  it('should return 401 when API key is missing', () => {
    Object.defineProperty(config, 'ADMIN_API_KEY', {
      value: 'secret-key',
      writable: true,
    });

    const req = mockRequest();
    const res = mockResponse();
    const next = mockNext;

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
          message: 'missing or invalid API key',
        }),
      }),
    );

    expect(next).not.toHaveBeenCalled();
  });


  it('should return 401 when API key is invalid', () => {
    Object.defineProperty(config, 'ADMIN_API_KEY', {
      value: 'secret-key',
      writable: true,
    });

    const req = mockRequest({
      'x-api-key': 'wrong-key',
    });

    const res = mockResponse();
    const next = mockNext;

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);

    expect(next).not.toHaveBeenCalled();
  });


  it('should call next when API key is valid', () => {
    Object.defineProperty(config, 'ADMIN_API_KEY', {
      value: 'secret-key',
      writable: true,
    });

    const req = mockRequest({
      'x-api-key': 'secret-key',
    });

    const res = mockResponse();
    const next = mockNext;

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalled();

    expect(res.status).not.toHaveBeenCalled();
  });
});