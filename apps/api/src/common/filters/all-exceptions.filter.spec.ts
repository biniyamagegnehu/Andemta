import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('should transform HttpException into standard error envelope', () => {
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const setHeaderMock = jest.fn();

    const mockResponse = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };

    const mockRequest = {
      id: 'test-req-123',
      method: 'GET',
      url: '/test',
      headers: {},
    };

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;

    const exception = new HttpException(
      { message: 'Not found', errors: [{ field: 'id', message: 'Item does not exist' }] },
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, mockHost);

    expect(setHeaderMock).toHaveBeenCalledWith('X-Request-ID', 'test-req-123');
    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      message: 'Not found',
      data: null,
      errors: [{ field: 'id', message: 'Item does not exist' }],
    });
  });

  it('should format non-HttpException error properly in development', () => {
    process.env.NODE_ENV = 'development';
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const setHeaderMock = jest.fn();

    const mockResponse = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };

    const mockRequest = {
      id: 'test-req-456',
      method: 'POST',
      url: '/crash',
      headers: {},
    };

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;

    const exception = new Error('Database connection failed');

    filter.catch(exception, mockHost);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      message: 'Database connection failed',
      data: null,
      errors: [],
    });
  });

  it('should hide internal error messages in production', () => {
    process.env.NODE_ENV = 'production';
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const setHeaderMock = jest.fn();

    const mockResponse = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };

    const mockRequest = {
      id: 'test-req-prod',
      method: 'POST',
      url: '/crash',
      headers: {},
    };

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;

    const exception = new Error('Sensitive DB password leak');

    filter.catch(exception, mockHost);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
      data: null,
      errors: [],
    });

    // Reset back to test
    process.env.NODE_ENV = 'test';
  });
});

