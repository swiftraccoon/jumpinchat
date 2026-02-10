let _io = null;

export function getIo() {
  return _io;
};

export function register(socket, io) {
  _io = io;
};

export default { getIo, register };
