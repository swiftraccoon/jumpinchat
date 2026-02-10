export function customError(name = 'Error', message) {
  const error = new Error();
  error.name = name;
  error.message = message;
  return error;
};

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}
export { ValidationError };

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export { NotFoundError };

class JanusError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JanusError';
  }
}

export { JanusError };

class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

export { PermissionError };

class FloodError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FloodError';
  }
}

export { FloodError };

class UnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedError';
  }
}

export { UnsupportedError };
