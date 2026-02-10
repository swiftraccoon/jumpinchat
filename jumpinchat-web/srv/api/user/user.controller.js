/**
 * Created by vivaldi on 08/11/2014.
 */



import userCreateSession from './controllers/user.createSession.js';
import userCreate from './controllers/user.create.js';
import userLogin from './controllers/user.login.js';
import userCheckUsername from './controllers/user.checkusername.js';
import userUpdateSession from './controllers/user.updateSession.js';
export function logout(req, res) {
  // clear cookies
  if (req.signedCookies['jic.ident']) {
    res.clearCookie('jic.ident');
    res.end();
  }
};

export const createSession = userCreateSession;
export const createUser = userCreate;
export const login = userLogin;
export const checkUsername = userCheckUsername;
export const updateSession = userUpdateSession;

export default { logout, createSession, createUser, login, checkUsername, updateSession };
